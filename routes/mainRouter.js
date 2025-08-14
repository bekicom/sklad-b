const express = require("express");
const router = express.Router();

// ✅ Controllerlar
const userController = require("../controllers/user.controller");
const clientController = require("../controllers/client.controller"); // 🚚 Yetkazib beruvchi
const customerSaleController = require("../controllers/customerSaleController"); // 🛒 Do'konga mijoz sotuvlari
const importController = require("../controllers/import.controller");
const storeController = require("../controllers/store.controller");
const saleController = require("../controllers/sale.controller"); // Ombor sotuvlari
const debtorController = require("../controllers/debtor.controller");

// ✅ Middleware
const au = require("../middlewares/auth.middleware");

/* ====================== 🔐 USER AUTH ROUTES ====================== */
router.post("/register", userController.registerUser);
router.post("/login", userController.loginUser);

/* ====================== 👥 CLIENT (YETKAZIB BERUVCHI) ROUTES ====================== */
router.post("/clients", au.verifyToken, clientController.createClient);
router.get("/clients", au.verifyToken, clientController.getClients);
router.get("/clients/:id", au.verifyToken, clientController.getClientById);
router.put("/clients/:id", au.verifyToken, clientController.updateClient);
router.delete("/clients/:id", au.verifyToken, clientController.deleteClient);
router.post("/clients/:clientId/pay", au.verifyToken, clientController.payDebt);
router.get(
  "/clients/:id/payments",
  au.verifyToken,
  clientController.getClientPayments
);
// 📊 Client statistikasi
router.get(
  "/clients/:id/stats",
  au.verifyToken,
  clientController.getClientStats
);

/* ====================== 🛒 CUSTOMER (DO'KON MIJOZLARI) ROUTES ====================== */
router.post(
  "/customers/sales",
  au.verifyToken,
  customerSaleController.createCustomerSale
); // Yangi sotuv
router.get(
  "/customers/sales",
  au.verifyToken,
  customerSaleController.getAllCustomerSales
); // Barcha sotuvlar
router.get(
  "/customers/all",
  au.verifyToken,
  customerSaleController.getAllCustomers
); // Barcha sotuvlar
router.get(
  "/customers/debtors",
  au.verifyToken,
  customerSaleController.getCustomerDebtors
); // Qarzdagi mijozlar
router.put(
  "/customers/pay-debt/:id",
  au.verifyToken,
  customerSaleController.payCustomerDebt
); // Qarz to'lash

/* ====================== 📦 IMPORT ROUTES ====================== */
// ❗ Aniq route'lar oldinda
router.get(
  "/imports/last-partiya",
  au.verifyToken,
  importController.getLastPartiyaNumber
);
router.post("/imports", au.verifyToken, importController.createImport);
router.get("/imports", au.verifyToken, importController.getAllImports);
router.get("/imports/:id", au.verifyToken, importController.getImportById);

/* ====================== 🏪 STORE ROUTES ====================== */
router.get("/store/all", au.verifyToken, storeController.getAllStoreProducts); // Aniq route
router.get("/store", au.verifyToken, storeController.getAllStoreItems);
router.get("/store/:importId", au.verifyToken, storeController.gSImportId);
router.put("/store/:id", au.verifyToken, storeController.updateStoreItem);
router.delete("/store/:id", au.verifyToken, storeController.deleteStoreItem);
router.get("/grouped", au.verifyToken, storeController.getGroupedStoreItems);

/* ====================== 🏷️ SALES ROUTES (Ombor sotuvlari) ====================== */
router.post("/sales", au.verifyToken, saleController.createSale);
router.get("/sales", au.verifyToken, saleController.getAllSales);
router.get("/sales/debtors", au.verifyToken, saleController.getDebtors);
router.put("/sales/pay/:id", au.verifyToken, saleController.payDebt);
router.get("/sales/:id/invoice", au.verifyToken, saleController.getInvoiceData); // yangilangan funksiya nomi
router.get("/sales/stats", au.verifyToken, saleController.getSalesStats);

/* ====================== 🧾 DEBTOR ROUTES ====================== */
router.post("/debtors", au.verifyToken, debtorController.createDebtor);
router.get("/debtors", au.verifyToken, debtorController.getDebtors);
router.put(
  "/debtors/:id/payment",
  au.verifyToken,
  debtorController.updateDebtorPayment
);
router.delete("/debtors/:id", au.verifyToken, debtorController.deleteDebtor);

// ❗ PATCH route nomi aniq bo'lishi kerak, qaysi modulga tegishli ekanligini bildir
router.patch("/debtors/pay/:id", au.verifyToken, debtorController.payDebt);

module.exports = router;
