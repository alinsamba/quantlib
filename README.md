# QuantLib

**QuantLib** is a comprehensive School Library Inventory & Analytics System. It modernizes manual, spreadsheet-based book tracking into a robust, offline-first application designed for school librarians. It provides easy inventory management, incident tracking (damaged, lost, recovered books), and generates actionable insights through an analytics dashboard.

## Key Features

- **Inventory Management**: Track book stock levels across various subjects. The system automatically computes available books based on initial counts, recovered books, issued books, damaged, and lost books.
- **Incident Logging**: A unified feed for logging events like book damage, loss, new additions, and recoveries.
- **Analytics Dashboard**: Visual insights including total books, available stock, damage/loss rates per subject, category-share charts, and low-stock alerts.
- **Audit Logging**: Maintains a secure history trail of all changes (e.g., who marked a book as issued and when).
- **Data Export & Reporting**: Export inventory and incident logs to Excel, or generate branded PDF term reports.
- **Offline-First & Local Data**: Utilizes a local SQLite database, ensuring a zero-config setup and easy offline backups without requiring an active internet connection.

## Tech Stack

This application is built with a modern, type-safe stack:
- **UI Framework**: React + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Database**: SQLite
- **ORM**: Prisma
- **Desktop Shell**: Electron (for packaging as a standalone `.exe`)

## Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn

### Installation

1. Navigate to the project directory:
   ```bash
   cd quantlib
   ```
2. Install the required dependencies:
   ```bash
   npm install
   ```

### Database Setup
The app uses Prisma with SQLite. To initialize the database and apply the schema:
```bash
npx prisma generate
npx prisma db push
```
*(You can also seed the database using `node seed.js` if a seed script is provided).*

### Running Locally

To start the Vite development server:
```bash
npm run dev
```

## Project Background
This project replaces the previous `Mentor_High_School-Kitende_Library_Books_Tracker.xlsx` spreadsheet system. For comprehensive design decisions, architecture details, and the build roadmap, please refer to the `QuantLib_App_Plan.md` file in the parent directory.
