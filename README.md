# QuantLib

**QuantLib** is a comprehensive, offline-first School Library Inventory & Analytics System. It modernizes spreadsheet-based book tracking into a robust desktop application tailored for school librarians. QuantLib provides end-to-end inventory tracking, issue/checkout management, incident logging, audit trails, and data visualization with built-in database encryption.

---

## 🌟 Key Features

- 🔒 **Zero-Trust Encrypted Storage**: Zero-config offline SQLite database encrypted using AES-256-GCM with PBKDF2 key derivation. Features emergency key recovery and secure memory wipe on application shutdown.
- 📚 **Inventory & Stock Tracking**: Real-time stock calculation per subject ($$\text{Available} = \text{Opening} + \text{Recovered} - \text{Issued} - \text{Damaged} - \text{Lost}$$).
- 🏷️ **Book Checkout & Overdue Management**: Issue books to students with custom due dates, track active checkouts, and monitor overdue returns with condition-loss tracking.
- 🚨 **Incident Logging**: Track damaged, lost, or recovered books with automated counter updates and audit trail logging.
- 📊 **Analytics Dashboard**: Interactive charts showing stock distribution across categories, average book condition health, low-stock warnings, and overdue indicators.
- 📋 **Audit Trail**: Maintains an immutable history log of stock edits, status changes, and user actions per subject.
- 📤 **Data Import & Export**: Import/export inventory and incident logs via Excel (`.xlsx`), and perform encrypted database backups.
- ⚙️ **School & Theme Customization**: Support for dark/light themes, custom school branding (name, motto, logo), and configurable checkout durations.

---

## 🛠️ Tech Stack

- **Desktop Framework**: [Tauri v2](https://tauri.app/) (Rust Core + IPC Command System)
- **UI Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite 8](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) + [Lucide React Icons](https://lucide.dev/)
- **Charts**: [Recharts](https://recharts.org/)
- **Database**: [SQLite](https://www.sqlite.org/) via [rusqlite](https://github.com/rusqlite/rusqlite) with WAL mode & automated integrity tracking
- **Security & Crypto**: Pure Rust Cryptography (`aes-gcm`, `pbkdf2` with 600,000 iterations, `sha2`, `rand`)
- **Networking & Sync**: Pure Rust HTTP Sync (`tiny_http`, `reqwest` with `rustls`)
- **Testing**: [Vitest](https://vitest.dev/) (frontend) + Cargo Test (Rust backend)
- **Packaging**: [Tauri CLI](https://tauri.app/reference/cli/)
---

## 🔐 Security & Encryption Architecture

QuantLib operates on an offline vault security model:
1. **Master Key Derivation**: User passwords derive cryptographic keys using **PBKDF2-HMAC-SHA256** with **600,000 iterations** and a 16-byte random salt.
2. **Dual-Key Wrapping**: A 256-bit random Master Key is encrypted using **AES-256-GCM** under both the Master Password and an emergency 16-character **Recovery Key**.
3. **Database Encryption**: The SQLite database file is encrypted at rest using AES-256-GCM with 12-byte distinct IVs and 16-byte authentication tags.
4. **Secure In-Memory Session**: During execution, the decrypted temporary database is maintained in application data storage and flushed/encrypted on write.
5. **Secure Memory Wipe**: Upon closing the app, the temporary database file is overwritten with zero-bytes (`fsync`), safely deleted, and key buffers in memory are wiped (`fill(0)`).

---

## 📁 Project Structure

```text
quantlib/
├── src-tauri/             # Tauri v2 Rust Core
│   ├── src/
│   │   ├── main.rs        # Application binary entry point
│   │   ├── lib.rs         # Tauri builder, state setup & command registration
│   │   ├── commands.rs    # Tauri command IPC handlers
│   │   ├── db.rs          # SQLite database schema, queries & CRUD logic
│   │   ├── crypto.rs      # AES-256-GCM vault encryption & PBKDF2 manager
│   │   ├── models.rs      # Rust domain structs & Serde models
│   │   └── services/      # Analytics, backup scheduler & LAN sync services
│   ├── Cargo.toml         # Rust crate manifest & dependencies
│   └── tauri.conf.json    # Tauri application configuration
├── src/
│   ├── components/        # Reusable UI components (Modals, Forms, Drawers)
│   ├── hooks/             # Custom React hooks & context providers
│   ├── lib/               # Utility functions & Tauri IPC client (`ipc-client.ts`)
│   ├── pages/             # Main view pages (Dashboard, Inventory, Incidents, Overdue, Settings, Login, StockAudit, Clearance, Analytics)
│   ├── App.tsx            # Main layout router
│   └── index.css          # Tailwind CSS entry file
└── vite.config.ts         # Vite frontend configuration
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18 or higher (v20+ recommended)
- **npm**: v9 or higher

### Installation

1. Clone or navigate to the repository directory:
   ```bash
   cd quantlib
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Database Setup

1. Generate the Prisma client code:
   ```bash
   npm run prisma:generate
   ```
2. Push the schema to SQLite (optional during development):
   ```bash
   npm run prisma:push
   ```
3. (Optional) Seed sample data:
   ```bash
   npm run seed
   ```

---

## 💻 Development & Building

### Running the App Locally

To start the Vite frontend and launch the Tauri desktop application:
```bash
npm run tauri:dev
```

To run the Vite web dev server independently:
```bash
npm run dev
```

### Running Tests

Run the test suite using Vitest:
```bash
npm run test
```

Run Oxlint for linting:
```bash
npm run lint
```

### Packaging for Production

Build the production desktop binary and installers:
```bash
npm run tauri:build
```
The packaged app installers and standalone executables will be output to the `src-tauri/target/release/` directory.

---

## 📜 Available NPM Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts Vite development server |
| `npm run tauri:dev` | Runs Tauri in development mode with hot-reloading |
| `npm run build` | Compiles TypeScript and builds Vite frontend distribution |
| `npm run tauri:build` | Compiles and packages production Tauri desktop app |
| `npm run test` | Runs frontend unit tests using Vitest |
| `npm run lint` | Runs Oxlint to check code quality |
| `npm run generate-icon` | Generates application PNG icon |
---

## 📄 License & Credits

Developed for **Mentor High School Library Book Tracking**. Replaces legacy Excel-based management workflows.

