use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use parking_lot::Mutex;

#[derive(Debug, Serialize, Deserialize)]
pub struct MetaPayload {
    pub salt: String,
    pub iterations: u32,
    pub password_payload: String,
    pub recovery_payload: String,
}

pub struct VaultManager {
    data_dir: PathBuf,
    current_master_key: Mutex<Option<[u8; 32]>>,
    encryption_lock: Mutex<()>,
}

impl VaultManager {
    pub fn new(data_dir: PathBuf) -> Self {
        if !data_dir.exists() {
            let _ = fs::create_dir_all(&data_dir);
        }
        Self {
            data_dir,
            current_master_key: Mutex::new(None),
            encryption_lock: Mutex::new(()),
        }
    }

    pub fn meta_file(&self) -> PathBuf {
        self.data_dir.join("quantlib.meta")
    }

    pub fn enc_file(&self) -> PathBuf {
        self.data_dir.join("quantlib.enc")
    }

    pub fn enc_backup_file(&self) -> PathBuf {
        self.data_dir.join("quantlib.enc.bak")
    }

    pub fn enc_temp_file(&self) -> PathBuf {
        self.data_dir.join("quantlib.enc.tmp")
    }

    pub fn temp_db_path(&self) -> PathBuf {
        self.data_dir.join("quantlib_temp.db")
    }

    pub fn check_db_status(&self) -> &'static str {
        if self.meta_file().exists() && self.enc_file().exists() {
            "LOCKED"
        } else {
            "SETUP"
        }
    }

    pub fn has_master_key(&self) -> bool {
        self.current_master_key.lock().is_some()
    }

    pub fn set_master_key(&self, key: [u8; 32]) {
        *self.current_master_key.lock() = Some(key);
    }

    pub fn get_master_key(&self) -> Option<[u8; 32]> {
        *self.current_master_key.lock()
    }

    pub fn clear_master_key(&self) {
        let mut lock = self.current_master_key.lock();
        if let Some(ref mut key) = *lock {
            for byte in key.iter_mut() {
                unsafe { std::ptr::write_volatile(byte, 0) };
            }
        }
        *lock = None;
    }

    fn derive_key(password: &str, salt: &[u8], iterations: u32) -> [u8; 32] {
        let mut key = [0u8; 32];
        pbkdf2::pbkdf2_hmac::<sha2::Sha256>(password.as_bytes(), salt, iterations, &mut key);
        key
    }

    fn encrypt_aes_gcm(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, String> {
        let mut iv = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut iv);

        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
        let nonce = Nonce::from_slice(&iv);
        let ct_with_tag = cipher
            .encrypt(nonce, plaintext)
            .map_err(|e| format!("Encryption error: {}", e))?;

        if ct_with_tag.len() < 16 {
            return Err("Invalid ciphertext length".into());
        }

        let tag_start = ct_with_tag.len() - 16;
        let tag = &ct_with_tag[tag_start..];
        let ct = &ct_with_tag[..tag_start];

        let mut output = Vec::with_capacity(12 + 16 + ct.len());
        output.extend_from_slice(&iv);
        output.extend_from_slice(tag);
        output.extend_from_slice(ct);
        Ok(output)
    }

    fn decrypt_aes_gcm(key: &[u8; 32], payload: &[u8]) -> Result<Vec<u8>, String> {
        if payload.len() < 28 {
            return Err("Payload too short".into());
        }
        let iv = &payload[0..12];
        let tag = &payload[12..28];
        let ct = &payload[28..];

        let mut ct_with_tag = Vec::with_capacity(ct.len() + 16);
        ct_with_tag.extend_from_slice(ct);
        ct_with_tag.extend_from_slice(tag);

        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
        let nonce = Nonce::from_slice(iv);
        cipher
            .decrypt(nonce, ct_with_tag.as_ref())
            .map_err(|e| format!("Decryption failed: {}", e))
    }

    pub fn setup_database(&self, password: &str) -> Result<String, String> {
        if password.trim().len() < 4 {
            return Err("Password must be at least 4 characters long".into());
        }
        if self.check_db_status() != "SETUP" {
            return Err("Database is already set up".into());
        }

        let mut salt = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut salt);

        let mut master_key = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut master_key);

        let mut rec_bytes = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut rec_bytes);
        let rec_hex = hex::encode(rec_bytes).to_uppercase();
        let recovery_key = rec_hex
            .as_bytes()
            .chunks(4)
            .map(|c| std::str::from_utf8(c).unwrap_or(""))
            .collect::<Vec<_>>()
            .join("-");

        let user_key = Self::derive_key(password, &salt, 600_000);
        let rec_user_key = Self::derive_key(&recovery_key, &salt, 600_000);

        let pass_payload_bytes = Self::encrypt_aes_gcm(&user_key, &master_key)?;
        let rec_payload_bytes = Self::encrypt_aes_gcm(&rec_user_key, &master_key)?;

        let meta = MetaPayload {
            salt: hex::encode(salt), // We can store hex or base64
            iterations: 600_000,
            password_payload: hex::encode(pass_payload_bytes),
            recovery_payload: hex::encode(rec_payload_bytes),
        };

        let meta_json = serde_json::to_string_pretty(&meta)
            .map_err(|e| format!("Failed to serialize meta: {}", e))?;
        let temp_meta = self.data_dir.join(format!("quantlib.meta.tmp.{}", rand::random::<u32>()));
        {
            let mut file = OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .open(&temp_meta)
                .map_err(|e| format!("Failed to create temp meta file: {}", e))?;
            file.write_all(meta_json.as_bytes())
                .map_err(|e| format!("Failed to write temp meta file: {}", e))?;
            file.sync_all()
                .map_err(|e| format!("Failed to sync temp meta file: {}", e))?;
        }
        #[cfg(windows)]
        {
            if self.meta_file().exists() {
                let _ = fs::remove_file(self.meta_file());
            }
        }
        fs::rename(&temp_meta, self.meta_file())
            .map_err(|e| format!("Failed to commit meta file: {}", e))?;
        // Initialize temp db
        let temp_db = self.temp_db_path();
        let _ = fs::write(&temp_db, b"");

        self.set_master_key(master_key);
        self.encrypt_temp_database()?;

        Ok(recovery_key)
    }

    pub fn unlock_database(&self, password: &str, is_recovery: bool) -> Result<(), String> {
        let meta_str = fs::read_to_string(self.meta_file())
            .map_err(|_| "Metadata file not found. Database may not be set up.".to_string())?;

        let meta: MetaPayload = serde_json::from_str(&meta_str)
            .map_err(|e| format!("Invalid metadata JSON: {}", e))?;

        let salt = if let Ok(bytes) = hex::decode(&meta.salt) {
            bytes
        } else {
            return Err("Failed to decode salt".into());
        };

        let iterations = if meta.iterations > 0 { meta.iterations } else { 600_000 };
        let user_key = Self::derive_key(password, &salt, iterations);

        let payload_str = if is_recovery {
            &meta.recovery_payload
        } else {
            &meta.password_payload
        };

        let payload_bytes = hex::decode(payload_str)
            .map_err(|_| "Failed to decode payload".to_string())?;

        let master_key_bytes = Self::decrypt_aes_gcm(&user_key, &payload_bytes)
            .map_err(|_| "Invalid password or recovery key".to_string())?;

        if master_key_bytes.len() != 32 {
            return Err("Decrypted master key length is invalid".into());
        }

        let mut master_key = [0u8; 32];
        master_key.copy_from_slice(&master_key_bytes);
        self.set_master_key(master_key);

        // Decrypt enc_file to temp_db
        let enc_file = self.enc_file();
        let temp_db = self.temp_db_path();
        if enc_file.exists() {
            let enc_data = fs::read(&enc_file)
                .map_err(|e| format!("Failed to read encrypted DB: {}", e))?;
            if !enc_data.is_empty() {
                let decrypted = Self::decrypt_aes_gcm(&master_key, &enc_data)?;
                fs::write(&temp_db, decrypted)
                    .map_err(|e| format!("Failed to write temp DB: {}", e))?;
            } else {
                let _ = fs::write(&temp_db, b"");
            }
        } else {
            let _ = fs::write(&temp_db, b"");
        }

        Ok(())
    }

    pub fn encrypt_temp_database(&self) -> Result<(), String> {
        let _lock_guard = self.encryption_lock.lock();
        let master_key = match self.get_master_key() {
            Some(k) => k,
            None => return Ok(()),
        };

        let temp_db = self.temp_db_path();
        if !temp_db.exists() {
            return Ok(());
        }

        let db_data = fs::read(&temp_db)
            .map_err(|e| format!("Failed to read temp DB: {}", e))?;

        let encrypted = Self::encrypt_aes_gcm(&master_key, &db_data)?;
        let enc_temp = self.data_dir.join(format!("quantlib.enc.tmp.{}", rand::random::<u32>()));
        let enc_file = self.enc_file();
        let enc_backup = self.enc_backup_file();

        fs::write(&enc_temp, &encrypted)
            .map_err(|e| format!("Failed to write encrypted temp: {}", e))?;

        if enc_file.exists() {
            let _ = fs::copy(&enc_file, &enc_backup);
        }

        #[cfg(windows)]
        {
            if enc_file.exists() {
                let _ = fs::remove_file(&enc_file);
            }
        }

        if let Err(e) = fs::rename(&enc_temp, &enc_file) {
            let _ = fs::remove_file(&enc_temp);
            return Err(format!("Failed to commit encrypted DB: {}", e));
        }

        Ok(())
    }

    pub fn change_password(&self, old_password: &str, new_password: &str) -> Result<String, String> {
        let meta_str = fs::read_to_string(self.meta_file())
            .map_err(|_| "Metadata not found".to_string())?;
        let meta: MetaPayload = serde_json::from_str(&meta_str)
            .map_err(|e| format!("Corrupt meta: {}", e))?;

        let old_salt = hex::decode(&meta.salt).map_err(|_| "Corrupt salt".to_string())?;
        let old_user_key = Self::derive_key(old_password, &old_salt, meta.iterations);

        let pass_payload_bytes = hex::decode(&meta.password_payload)
            .map_err(|_| "Corrupt password payload".to_string())?;

        let master_key_bytes = Self::decrypt_aes_gcm(&old_user_key, &pass_payload_bytes)
            .map_err(|_| "Incorrect current password".to_string())?;

        let mut master_key = [0u8; 32];
        master_key.copy_from_slice(&master_key_bytes);

        // Generate new salt and recovery key
        let mut new_salt = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut new_salt);

        let mut rec_bytes = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut rec_bytes);
        let rec_hex = hex::encode(rec_bytes).to_uppercase();
        let recovery_key = rec_hex
            .as_bytes()
            .chunks(4)
            .map(|c| std::str::from_utf8(c).unwrap_or(""))
            .collect::<Vec<_>>()
            .join("-");

        let new_user_key = Self::derive_key(new_password, &new_salt, 600_000);
        let new_rec_user_key = Self::derive_key(&recovery_key, &new_salt, 600_000);

        let new_pass_payload = Self::encrypt_aes_gcm(&new_user_key, &master_key)?;
        let new_rec_payload = Self::encrypt_aes_gcm(&new_rec_user_key, &master_key)?;

        let new_meta = MetaPayload {
            salt: hex::encode(new_salt),
            iterations: 600_000,
            password_payload: hex::encode(new_pass_payload),
            recovery_payload: hex::encode(new_rec_payload),
        };

        let meta_json = serde_json::to_string_pretty(&new_meta)
            .map_err(|e| format!("Failed to serialize new meta: {}", e))?;
        let temp_meta = self.data_dir.join(format!("quantlib.meta.tmp.{}", rand::random::<u32>()));
        {
            let mut file = OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .open(&temp_meta)
                .map_err(|e| format!("Failed to create temp meta file: {}", e))?;
            file.write_all(meta_json.as_bytes())
                .map_err(|e| format!("Failed to write temp meta file: {}", e))?;
            file.sync_all()
                .map_err(|e| format!("Failed to sync temp meta file: {}", e))?;
        }
        #[cfg(windows)]
        {
            if self.meta_file().exists() {
                let _ = fs::remove_file(self.meta_file());
            }
        }
        fs::rename(&temp_meta, self.meta_file())
            .map_err(|e| format!("Failed to save new meta: {}", e))?;

        self.set_master_key(master_key);
        Ok(recovery_key)
    }

    pub fn secure_wipe(path: &Path) {
        if !path.exists() {
            return;
        }
        if let Ok(metadata) = fs::metadata(path) {
            let len = metadata.len();
            if let Ok(mut file) = OpenOptions::new().write(true).open(path) {
                let zero_buf = [0u8; 4096];
                let mut written = 0u64;
                while written < len {
                    let to_write = std::cmp::min(4096, (len - written) as usize);
                    if file.write_all(&zero_buf[..to_write]).is_err() {
                        break;
                    }
                    written += to_write as u64;
                }
                let _ = file.sync_all();
            }
        }
        let _ = fs::remove_file(path);
    }

    pub fn cleanup(&self) {
        let temp_db = self.temp_db_path();
        if temp_db.exists() {
            let _ = self.encrypt_temp_database();
            Self::secure_wipe(&temp_db);
            Self::secure_wipe(&self.data_dir.join("quantlib_temp.db-wal"));
            Self::secure_wipe(&self.data_dir.join("quantlib_temp.db-shm"));
        }
        self.clear_master_key();
    }
}
