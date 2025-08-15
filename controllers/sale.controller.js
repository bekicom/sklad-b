const Sale = require("../models/Sale");
const Customer = require("../models/Customer");
const Store = require("../models/Store");
const Debtor = require("../models/debtor.model");
const Client = require("../models/Client");

// 🛒 Sotuv yaratish (mavjud kod + faktura raqami)
exports.createSale = async (req, res) => {
  try {
    let { customer, products, paid_amount, shop_info } = req.body;
    paid_amount = Number(paid_amount) || 0;

    // 1️⃣ Mijozni topish yoki yaratish
    let customerData = await Customer.findOne({ phone: customer.phone });
    if (!customerData) {
      if (!customer.name) {
        return res
          .status(400)
          .json({ message: "Mijoz nomi kiritilishi shart" });
      }
      customerData = await Customer.create({
        name: customer.name,
        phone: customer.phone || "",
        address: customer.address || "",
        totalPurchased: 0,
        totalPaid: 0,
        totalDebt: 0,
        paymentHistory: [],
      });
    }

    // 2️⃣ Mahsulotlarni tekshirish va ombordan ayirish
    let total_amount = 0;
    let saleProducts = [];

    for (let p of products) {
      const product = await Store.findById(p.product_id);
      if (!product || product.quantity < p.quantity) {
        return res.status(400).json({
          message: `${
            product?.product_name || "Mahsulot"
          } omborda yetarli emas`,
        });
      }

      const purchase_price = product.unit_price || 0;

      // Ombordan kamaytirish
      product.quantity -= p.quantity;
      await product.save();

      // Sotuv uchun mahsulot ma’lumotlari
      saleProducts.push({
        product_id: product._id,
        name: product.product_name,
        model: product.model,
        unit: product.unit,
        price: p.price || product.sell_price,
        purchase_price,
        quantity: p.quantity,
        currency: product.currency,
        partiya_number: product.partiya_number,
      });

      total_amount += (p.price || product.sell_price) * p.quantity;
    }

    // 3️⃣ Qolgan qarz summasi va to‘lov turi
    const remaining_debt = total_amount - paid_amount;
    let payment_method = remaining_debt > 0 ? "qarz" : "cash"; // ✅ enum mos

    // 4️⃣ Faktura raqami
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    const todayStart = new Date(year, today.getMonth(), today.getDate());
    const todayEnd = new Date(year, today.getMonth(), today.getDate() + 1);

    const todayCount = await Sale.countDocuments({
      createdAt: { $gte: todayStart, $lt: todayEnd },
    });

    const invoice_number = `INV-${year}${month}${day}-${String(
      todayCount + 1
    ).padStart(3, "0")}`;

    // 5️⃣ Sotuvni yaratish
    const sale = await Sale.create({
      invoice_number,
      customer_id: customerData._id,
      products: saleProducts,
      total_amount,
      paid_amount,
      payment_method,
      remaining_debt,
      shop_info: shop_info || {
        name: "Sizning do'koningiz",
        address: "Do'kon manzili",
        phone: "+998 90 123 45 67",
      },
    });

    // 6️⃣ Mijoz balansini yangilash
    customerData.totalPurchased += total_amount;
    customerData.totalPaid += paid_amount;
    customerData.totalDebt =
      customerData.totalPurchased - customerData.totalPaid;

    // ✅ paymentHistory maydoni mavjudligini tekshirish
    if (!Array.isArray(customerData.paymentHistory)) {
      customerData.paymentHistory = [];
    }

    // Qarz bo‘lsa va sotuv vaqtida qisman to‘lov bo‘lsa
    if (remaining_debt > 0 && paid_amount > 0) {
      customerData.paymentHistory.push({
        amount: paid_amount,
        date: new Date(),
        note: "Qarz to'lovi (sotuv vaqtida)",
      });
    }

    await customerData.save();

    // 7️⃣ Agar qarz bo‘lsa Debtor kolleksiyasiga yozish
    if (remaining_debt > 0) {
      await Debtor.create({
        customer_id: customerData._id,
        products: saleProducts.map((p) => ({
          product_id: p.product_id,
          name: p.name,
          quantity: p.quantity,
          price: p.price,
        })),
        totalAmount: total_amount,
        paidAmount: paid_amount,
        remainingAmount: remaining_debt,
        paymentHistory:
          paid_amount > 0 ? [{ amount: paid_amount, date: new Date() }] : [],
      });
    }

    res.json({ success: true, sale, customer: customerData });
  } catch (err) {
    console.error("❌ createSale error:", err);
    res.status(500).json({ message: err.message });
  }
};



// 📄 Barcha sotuvlarni olish
exports.getAllSales = async (req, res) => {
  try {
    const sales = await Sale.find()
      .populate("customer_id")
      .sort({ createdAt: -1 });

    res.json({ success: true, sales });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 🔍 Bitta sotuvni olish
exports.getSaleById = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id).populate("customer_id");

    if (!sale) return res.status(404).json({ message: "Sotuv topilmadi" });

    res.json({ success: true, sale });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 🧾 Faktura ma'lumotlarini olish (print uchun)
exports.getInvoiceData = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate("customer_id")
      .populate("products.product_id");

    if (!sale) {
      return res.status(404).json({ message: "Faktura topilmadi" });
    }

    // Faktura ma'lumotlarini formatlash
    const invoiceData = {
      // Faktura asosiy ma'lumotlari
      invoice_number: sale.invoice_number,
      date: sale.createdAt,

      // Do'kon ma'lumotlari
      shop: sale.shop_info,

      // Mijoz ma'lumotlari
      customer: {
        name: sale.customer_id.name,
        phone: sale.customer_id.phone,
        address: sale.customer_id.address,
      },

      // Mahsulotlar ro'yxati
      products: sale.products.map((product) => ({
        name: product.name,
        model: product.model,
        unit: product.unit,
        quantity: product.quantity,
        price: product.price,
        total: product.price * product.quantity,
        currency: product.currency,
      })),

      // To'lov ma'lumotlari
      payment: {
        total_amount: sale.total_amount,
        paid_amount: sale.paid_amount,
        remaining_debt: sale.remaining_debt,
        payment_method: sale.payment_method,
        payment_status: sale.remaining_debt > 0 ? "qarz" : "to'liq to'langan",
      },
    };

    res.json({ success: true, invoice: invoiceData });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 💰 Qarz to'lash (yangilangan)
exports.payDebt = async (req, res) => {
  try {
    const { amount } = req.body;
    const sale = await Sale.findById(req.params.id);

    if (!sale) return res.status(404).json({ message: "Sotuv topilmadi" });

    // To'lov miqdorini tekshirish
    if (amount <= 0) {
      return res
        .status(400)
        .json({ message: "To'lov miqdori 0 dan katta bo'lishi kerak" });
    }

    if (amount > sale.remaining_debt) {
      return res
        .status(400)
        .json({ message: "To'lov miqdori qarzdan katta bo'lishi mumkin emas" });
    }

    sale.paid_amount += amount;
    sale.remaining_debt -= amount;

    // Agar qarz to'liq to'langan bo'lsa
    if (sale.remaining_debt <= 0) {
      sale.payment_method = "to'landi";
      sale.remaining_debt = 0;
    }

    await sale.save();

    // Mijoz balansini ham yangilash
    const customer = await Customer.findById(sale.customer_id);
    if (customer) {
      customer.totalPaid += amount;
      customer.totalDebt = customer.totalPurchased - customer.totalPaid;
      await customer.save();
    }

    res.json({ success: true, sale });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 📊 Qarzchilar ro'yxati (yangilangan)
exports.getDebtors = async (req, res) => {
  try {
    const debtors = await Sale.find({ remaining_debt: { $gt: 0 } })
      .populate("customer_id")
      .sort({ createdAt: -1 });

    res.json({ success: true, debtors });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 🔄 Faktura qayta chop etish
exports.reprintInvoice = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id).populate("customer_id");

    if (!sale) {
      return res.status(404).json({ message: "Faktura topilmadi" });
    }

    res.json({
      success: true,
      message: "Faktura qayta chop etishga tayyor",
      sale,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Qolgan kodlar bir xil...
exports.updateSale = async (req, res) => {
  try {
    const sale = await Sale.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });

    if (!sale) return res.status(404).json({ message: "Sotuv topilmadi" });

    res.json({ success: true, sale });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteSale = async (req, res) => {
  try {
    const sale = await Sale.findByIdAndDelete(req.params.id);

    if (!sale) return res.status(404).json({ message: "Sotuv topilmadi" });

    res.json({ success: true, message: "Sotuv o'chirildi" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getSalesStats = async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilter = {};

    if (from && to && !isNaN(new Date(from)) && !isNaN(new Date(to))) {
      dateFilter.createdAt = {
        $gte: new Date(from),
        $lte: new Date(to),
      };
    }

    // 📌 Sotuvlar
    const sales = await Sale.find(dateFilter).populate({
      path: "products.product_id",
      select: "purchase_price unit",
    });

    // 📌 Mijozlardan qarz to‘lovlari (Customer.paymentHistory)
    const customers = await Customer.find().select("payment_history");

    // 📌 Yetkazib beruvchilardan qarz to‘lovlari (Client.paymentHistory)
    const clients = await Client.find().select("paymentHistory");

    let stats = {
      total_sales_count: 0,
      total_revenue: 0,
      total_profit: 0,
      cash_total: 0,
      card_total: 0,
      debt_total: 0,
      product_details: {},
      store_debt_received: 0, // 🆕 Do‘kondan kelgan qarz to‘lovlari
      supplier_payments_total: 0, // 🆕 Yetkazib beruvchiga to‘langan pullar
    };

    // 🔹 Sotuvlardan umumiy statistika
    sales.forEach((sale) => {
      stats.total_sales_count++;
      stats.total_revenue += sale.total_amount || 0;

      if (sale.payment_method === "naxt") {
        stats.cash_total += sale.total_amount || 0;
      } else if (sale.payment_method === "karta") {
        stats.card_total += sale.total_amount || 0;
      } else if (sale.payment_method === "qarz") {
        stats.debt_total += sale.remaining_debt || 0;
        stats.cash_total += sale.paid_amount || 0;
      }

      sale.products.forEach((p) => {
        const product = p.product_id || {};
        const purchasePrice = product.purchase_price || 0;
        const sellPrice = p.price || 0;
        const quantity = p.quantity || 0;

        const revenue = sellPrice * quantity;
        const cost = purchasePrice * quantity;
        const profit = revenue - cost;

        stats.total_profit += profit;

        if (!stats.product_details[p.name]) {
          stats.product_details[p.name] = {
            revenue: 0,
            cost: 0,
            profit: 0,
            unit: p.unit,
          };
        }

        stats.product_details[p.name].revenue += revenue;
        stats.product_details[p.name].cost += cost;
        stats.product_details[p.name].profit += profit;
      });
    });

    // 🔹 Do‘kondan qarz to‘lovlari
    customers.forEach((cust) => {
      (cust.payment_history || []).forEach((p) => {
        stats.store_debt_received += p.amount || 0;
      });
    });

    // 🔹 Yetkazib beruvchiga qarz to‘lovlari
    clients.forEach((client) => {
      (client.paymentHistory || []).forEach((p) => {
        stats.supplier_payments_total += p.amount || 0;
      });
    });

    stats.total_profit = Number(stats.total_profit.toFixed(2));

    res.json({
      success: true,
      stats,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

