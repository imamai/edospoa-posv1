# 🗄️ Supabase Setup Guide - Persistent Data Storage

Your POS system is now configured to **automatically connect** to Supabase and **keep all data persistent** across sessions.

---

## **Step 1: Create Supabase Project**

1. Go to **https://supabase.com**
2. Click **"Sign up"** (free account)
3. Create a new project
4. Wait for it to initialize (takes 1-2 minutes)

---

## **Step 2: Get Your Credentials**

Once your project is created:

1. Go to **Settings** (bottom left)
2. Click **API**
3. Copy these two values:
   - **Project URL** (example: `https://kqpltwrhzbjfyxkttwzh.supabase.co/rest/v1/`)
   - **Anon public key** (example: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxcGx0d3JoemJqZnl4a3R0d3poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNjM0NTYsImV4cCI6MjA5MzkzOTQ1Nn0.rR1t4jtXTCCfooTuczSU-CGNxQKAhgXvFJssatn3a6Y`)

---

## **Step 3: Create Database Tables**

1. In Supabase, go to **SQL Editor** (left menu)
2. Click **"New Query"**
3. Copy and paste this entire SQL code:

```sql
create table if not exists clients (
  id text primary key, 
  name text, 
  phone text, 
  email text, 
  event text, 
  notes text, 
  created_at text
);

create table if not exists invoices (
  id text primary key, 
  data jsonb, 
  created_at timestamp default now()
);

create table if not exists payments (
  id text primary key, 
  invoice_id text, 
  amount numeric, 
  method text, 
  note text, 
  paid_at text
);

alter table clients enable row level security;
alter table invoices enable row level security;
alter table payments enable row level security;

create policy "allow all" on clients for all using (true) with check (true);
create policy "allow all" on invoices for all using (true) with check (true);
create policy "allow all" on payments for all using (true) with check (true);
```

4. Click **"Run"** (wait for confirmation)

---

## **Step 4: Configure Your HTML File**

Open **majason-pos.html** in an editor and find this section (around line 407):

```javascript
// ⚙️ UPDATE THESE WITH YOUR SUPABASE CREDENTIALS
const SUPABASE_CONFIG = {
  url: 'https://YOUR_PROJECT_ID.supabase.co',
  key: 'YOUR_ANON_PUBLIC_KEY'
};
```

Replace with your actual credentials:

```javascript
// ⚙️ UPDATE THESE WITH YOUR SUPABASE CREDENTIALS
const SUPABASE_CONFIG = {
  url: 'https://abcdefg123456.supabase.co',      // YOUR Project URL
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' // YOUR Anon public key
};
```

**Save the file** (Ctrl+S)

---

## **Step 5: Test It Works**

1. Open **majason-pos.html** in your browser
2. You should see:
   - ✅ **Green "Supabase connected" badge** at login
   - ✅ Goes **straight to login page** (no setup screen)
3. Log in with: `admin` / `admin`
4. Create an invoice
5. **Close and reopen the page** - invoice should still be there! ✅

---

## **How Data Persistence Works**

### **When You Create Data:**
```
Invoice Created → Automatically saved to Supabase ✅
Client Added    → Automatically saved to Supabase ✅
Payment Recorded → Automatically saved to Supabase ✅
```

### **When You Log In:**
```
1. Click Login
2. System loads all data from Supabase
3. All invoices, clients, payments appear ✅
4. You can edit/delete as needed
```

### **Data Types That Persist:**
- ✅ Invoices
- ✅ Clients
- ✅ Payments
- ✅ Client contact info

---

## **Managing Your Data**

### **View Data in Supabase:**
1. Open **Supabase Dashboard**
2. Go to **Table Editor** (left menu)
3. Click **invoices**, **clients**, or **payments**
4. See all your records

### **Delete Records:**
1. In the POS system - no delete button needed yet
2. Or go to Supabase → Table Editor → Select row → Delete

### **Export Data:**
1. Supabase → Table Editor
2. Select data → Export as CSV

---

## **Troubleshooting**

### **"Supabase connected" badge not showing?**
- ❌ Credentials are wrong or incomplete
- ✅ Copy credentials again carefully from Supabase Settings → API
- ✅ Make sure URL and Key have no extra spaces

### **Data not saving?**
- ❌ Tables not created properly
- ✅ Go to Supabase → SQL Editor → Run the SQL code again
- ✅ Check for error messages

### **Data disappears after closing?**
- ❌ Setup incomplete
- ✅ Make sure badge shows "Supabase connected" (green)
- ✅ Verify SQL tables were created in Supabase

### **Can't log in?**
- ❌ Normal - use demo credentials
- ✅ Username: `admin` Password: `admin`
- ✅ Or: `manager` / `manager` or `cashier` / `cashier`

---

## **Quick Reference**

| What | Where |
|------|-------|
| **Project URL** | Supabase → Settings → API → Project URL |
| **Anon Key** | Supabase → Settings → API → Anon public key |
| **Credentials in Code** | majason-pos.html line ~407 `SUPABASE_CONFIG` |
| **View Data** | Supabase → Table Editor |
| **Create Tables** | Supabase → SQL Editor (run SQL code) |
| **Test Connection** | Open HTML → Look for green badge |

---

## **You're All Set! 🎉**

Your system is now:
- ✅ Auto-connecting to Supabase
- ✅ Skipping setup screen
- ✅ Keeping all data persistent
- ✅ Loading data when you log in

**All your invoices, clients, and payments are now saved permanently!**

