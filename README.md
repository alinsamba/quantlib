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

- **Desktop Framework**: [Electron](https://www.electronjs.org/) (Main + Preload + Renderer architecture)
- **UI Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite 8](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) + [Lucide React Icons](https://lucide.dev/)
- **Charts**: [Recharts](https://recharts.org/)
- **Database & ORM**: [SQLite](https://www.sqlite.org/) + [Prisma ORM](https://www.prisma.io/)
- **Security & Crypto**: Node.js `crypto` (AES-256-GCM, PBKDF2 with 600,000 iterations)
- **Testing**: [Vitest](https://vitest.dev/)
- **Packaging**: [Electron Builder](https://www.electron.build/)

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
├── electron/              # Electron main process & IPC handlers
│   ├── main.ts            # Application window, lifecycle & IPC endpoints
│   ├── preload.ts         # ContextBridge security IPC layer
│   └── crypto.ts          # AES-256-GCM encryption & vault manager
├── prisma/
│   └── schema.prisma      # Database schema definition
├── src/
│   ├── components/        # Reusable UI components (Modals, Forms, Drawers)
│   ├── hooks/             # Custom React hooks & context providers
│   ├── lib/               # Utility functions & IPC bridge client (`db.ts`)
│   ├── pages/             # Main view pages (Dashboard, Inventory, Incidents, Overdue, Settings, Login)
│   ├── App.tsx            # Main layout router
│   └── index.css          # Tailwind CSS entry file
├── scripts/               # Utility & seed scripts
└── vite.config.ts         # Vite & Electron plugin configuration
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

To start the Vite dev server and launch the Electron application window:
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

Build the production desktop binary (`.exe` for Windows):
```bash
npm run build
```
The packaged app installers and standalone executables will be output to the `release/` directory.

---

## 📜 Available NPM Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts Vite development server and launches Electron desktop app |
| `npm run build` | Compiles TypeScript, builds Vite renderer, and packages app with Electron Builder |
| `npm run test` | Runs test suite using Vitest |
| `npm run lint` | Runs Oxlint to check code quality |
| `npm run prisma:generate` | Generates TypeScript client files from `prisma/schema.prisma` |
| `npm run prisma:push` | Syncs schema changes directly with the SQLite database |
| `npm run seed` | Seeds database with initial subjects and sample incident data |
| `npm run generate-icon` | Generates application PNG icon |

---

## 📄 License & Credits

Developed for **Mentor High School Library Book Tracking**. Replaces legacy Excel-based management workflows.

