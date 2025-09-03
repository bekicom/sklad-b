const express = require("express");
const router = express.Router();

// ===================== CONTROLLERS =====================
const userController = require("../controllers/user.controller");
const clientController = require("../controllers/client.controller");
const customerSaleController = require("../controllers/customerSaleController");
const importController = require("../controllers/import.controller");
const storeController = require("../controllers/store.controller");
const saleController = require("../controllers/sale.controller");
const debtorController = require("../controllers/debtor.controller");
const expenseController = require("../controllers/expense.controller");
const agentController = require("../controllers/agent.controller");

// ===================== MIDDLEWARE =====================
const au = require("../middlewares/auth.middleware");

// ===================== USER AUTH =====================
router.post("/register", userController.registerUser);
router.post("/login", userController.loginUser);

// ===================== AGENTS =====================
// 🔑 Agent login
router.post("/agents/login", agentController.loginAgent);

// ➕ Admin yangi agent qo‘shishi
router.post("/agents", au.verifyToken, agentController.createAgent);

// 📋 Agentlar ro‘yxati
router.get("/agents", au.verifyToken, agentController.listAgents);

// ✏️ Agent yangilash
router.put("/agents/:id", au.verifyToken, agentController.updateAgent);

// 🔑 Agent parolini yangilash
router.patch(
  "/agents/:id/reset-password",
  au.verifyToken,
  agentController.resetAgentPassword
);

// 📊 Bitta agent sotuvlari (admin → agent detail sahifasi)
router.get("/agents/:id/sales", au.verifyToken, saleController.getSalesByAgent);

// ===================== CLIENT ROUTES =====================
router.get("/clienthistory/:id/", clientController.getClientImportsHistory);

router.post("/clients", au.verifyToken, clientController.createClient);
router.get("/clients", au.verifyToken, clientController.getClients);
router.get("/clients/:id", au.verifyToken, clientController.getClientById);
router.put("/clients/:id", au.verifyToken, clientController.updateClient);
router.delete("/clients/:id", au.verifyToken, clientController.deleteClient);

// 🔹 Client qarzlar
router.post("/clients/:clientId/pay", au.verifyToken, clientController.payDebt);
router.post(
  "/clients/:clientId/debt",
  au.verifyToken,
  clientController.addDebt
);
router.get(
  "/clients/:id/payments",
  au.verifyToken,
  clientController.getClientPayments
);
router.get(
  "/clients/:id/stats",
  au.verifyToken,
  clientController.getClientStats
);

// ===================== CUSTOMER SALES =====================
router.post(
  "/customers/sales",
  au.verifyToken,
  customerSaleController.createCustomerSale
);
router.get(
  "/customers/sales",
  au.verifyToken,
  customerSaleController.getAllCustomerSales
);
router.get(
  "/customers/all",
  au.verifyToken,
  customerSaleController.getAllCustomers
);
router.get(
  "/customers/debtors",
  au.verifyToken,
  customerSaleController.getCustomerDebtors
);
router.put(
  "/customers/pay-debt/:id",
  au.verifyToken,
  customerSaleController.payCustomerDebt
);
router.put(
  "/customers/add-debt/:id",
  au.verifyToken,
  customerSaleController.addCustomerDebt
);

// ===================== EXPENSES =====================
router.get(
  "/expenses/categories",
  au.verifyToken,
  expenseController.getAllCategories
);
router.post(
  "/expenses/categories",
  au.verifyToken,
  expenseController.createCategory
);
router.post("/expenses", au.verifyToken, expenseController.createExpense);
router.get("/expenses", au.verifyToken, expenseController.getAllExpenses);
router.get("/expenses/:id", au.verifyToken, expenseController.getExpenseById);
router.put("/expenses/:id", au.verifyToken, expenseController.updateExpense);
router.delete("/expenses/:id", au.verifyToken, expenseController.deleteExpense);

// ===================== IMPORTS =====================
router.get(
  "/imports/last-partiya",
  au.verifyToken,
  importController.getLastPartiyaNumber
);
router.post("/imports", au.verifyToken, importController.createImport);
router.get("/imports", au.verifyToken, importController.getAllImports);
router.get("/imports/:id", au.verifyToken, importController.getImportById);

// ===================== STORE =====================
router.get("/store/all", au.verifyToken, storeController.getAllStoreProducts);
router.get("/store", au.verifyToken, storeController.getAllStoreItems);
router.get("/store/:importId", au.verifyToken, storeController.gSImportId);
router.put("/store/:id", au.verifyToken, storeController.updateStoreItem);
router.delete("/store/:id", au.verifyToken, storeController.deleteStoreItem);
router.get("/grouped", au.verifyToken, storeController.getGroupedStoreItems);

// ===================== SALES =====================
// ➕ Yangi sotuv (agent yoki admin)
router.post("/sales", au.verifyToken, saleController.createSale);

// 📋 Barcha sotuvlar (admin → hamma agentlar va kassirlar sotuvlari)
router.get("/sales", au.verifyToken, saleController.getAllSales);

// 👤 Faqat shu agentning o‘z sotuvlari (token orqali)
router.get("/sales/my", au.verifyToken, saleController.getMySales);

// 📊 Agent bo‘yicha sotuvlar (admin → filter qilinganda)
router.get(
  "/sales/agent/:agentId",
  au.verifyToken,
  saleController.getSalesByAgent
);

// 👥 Qarzdorlar
router.get("/sales/debtors", au.verifyToken, saleController.getDebtors);

// 💳 Qarzni to‘lash
router.put("/sales/pay/:id", au.verifyToken, saleController.payDebt);

// 🧾 Faktura olish
router.get("/sales/:id/invoice", au.verifyToken, saleController.getInvoiceData);

// 📈 Statistika
router.get("/sales/stats", au.verifyToken, saleController.getSalesStats);

// ✅ Sotuvni tasdiqlash (admin → pending → approved)
router.put("/sales/:id/approve", au.verifyToken, saleController.approveSale);

// ===================== DEBTORS =====================
router.post("/debtors", au.verifyToken, debtorController.createDebtor);
router.get("/debtors", au.verifyToken, debtorController.getDebtors);
router.put(
  "/debtors/:id/payment",
  au.verifyToken,
  debtorController.updateDebtorPayment
);
router.delete("/debtors/:id", au.verifyToken, debtorController.deleteDebtor);
router.patch("/debtors/pay/:id", au.verifyToken, debtorController.payDebt);

module.exports = router;
