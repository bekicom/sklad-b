const Sale = require("../models/Sale");
const Customer = require("../models/Customer");
const Store = require("../models/Store");

// 🛒 Sotuv yaratish (mavjud kod + faktura raqami)
exports.createSale = async (req, res) => {
  try {
    const { customer, products, paid_amount, payment_method, shop_info } =
      req.body;

    let customerData;
    customerData = await Customer.findOne({ phone: customer.phone });

    // 1️⃣ Mijozni topish yoki yaratish
    if (customerData) {
      console.log("mijoz bor");
    } else {
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

      // Ombordagi miqdorni kamaytirish
      product.quantity -= p.quantity;
      await product.save();

      // Sotuvga qo'shish
      saleProducts.push({
        product_id: product._id,
        name: product.product_name,
        model: product.model,
        unit: product.unit,
        price: p.price || product.sell_price,
        purchase_price: product.unit_price,
        quantity: p.quantity,
        currency: product.currency,
        partiya_number: product.partiya_number,
      });

      total_amount += (p.price || product.sell_price) * p.quantity;
    }

    // 3️⃣ Faktura raqamini yaratish
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    // Bugungi sotuvlar sonini hisoblash
    const todayStart = new Date(year, today.getMonth(), today.getDate());
    const todayEnd = new Date(year, today.getMonth(), today.getDate() + 1);
    const todayCount = await Sale.countDocuments({
      createdAt: { $gte: todayStart, $lt: todayEnd },
    });

    const invoice_number = `INV-${year}${month}${day}-${String(
      todayCount + 1
    ).padStart(3, "0")}`;

    // 4️⃣ Sotuvni yaratish
    const sale = await Sale.create({
      invoice_number,
      customer_id: customerData._id,
      products: saleProducts,
      total_amount,
      paid_amount,
      payment_method,
      remaining_debt: total_amount - paid_amount,
      shop_info: shop_info || {
        name: "Sizning do'koningiz",
        address: "Do'kon manzili",
        phone: "+998 90 123 45 67",
      },
    });

    // 5️⃣ Mijoz balansini yangilash
    customerData.totalPurchased += total_amount;
    customerData.totalPaid += paid_amount;
    customerData.totalDebt =
      customerData.totalPurchased - customerData.totalPaid;
    await customerData.save();

    res.json({ success: true, sale, customer: customerData });
  } catch (err) {
    console.log(err);

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
    const granularity = (req.query.granularity || "day").toLowerCase();
    const start = req.query.start
      ? new Date(req.query.start)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = req.query.end ? new Date(req.query.end) : new Date();

    if (
      !(start instanceof Date) ||
      isNaN(start.getTime()) ||
      !(end instanceof Date) ||
      isNaN(end.getTime())
    ) {
      return res.status(400).json({ message: "start/end noto'g'ri sana" });
    }

    const dateFmt = granularity === "month" ? "%Y-%m" : "%Y-%m-%d";

    const profitExpr = {
      $sum: {
        $map: {
          input: "$products",
          as: "p",
          in: {
            $multiply: [
              {
                $subtract: [
                  "$$p.price",
                  { $ifNull: ["$$p.purchase_price", 0] },
                ],
              },
              { $ifNull: ["$$p.quantity", 0] },
            ],
          },
        },
      },
    };

    const seriesPipeline = [
      { $match: { createdAt: { $gte: start, $lte: end } } },
      {
        $addFields: {
          profit: profitExpr,
          debtDoc: { $ifNull: ["$remaining_debt", 0] },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: dateFmt, date: "$createdAt" } },
          total: { $sum: "$total_amount" },
          paid: { $sum: { $ifNull: ["$paid_amount", 0] } },
          debt: { $sum: "$debtDoc" },
          orders: { $sum: 1 },
          profit: { $sum: "$profit" },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          date: "$_id",
          total: 1,
          paid: 1,
          debt: 1,
          orders: 1,
          profit: 1,
        },
      },
    ];

    const summaryPipeline = [
      { $match: { createdAt: { $gte: start, $lte: end } } },
      {
        $addFields: {
          profit: profitExpr,
          debtDoc: { $ifNull: ["$remaining_debt", 0] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$total_amount" },
          paid: { $sum: { $ifNull: ["$paid_amount", 0] } },
          debt: { $sum: "$debtDoc" },
          orders: { $sum: 1 },
          profit: { $sum: "$profit" },
        },
      },
      {
        $project: {
          _id: 0,
          total: 1,
          paid: 1,
          debt: 1,
          orders: 1,
          profit: 1,
          aov: {
            $cond: [
              { $gt: ["$orders", 0] },
              { $divide: ["$total", "$orders"] },
              0,
            ],
          },
        },
      },
    ];

    const paymentBreakdownPipeline = [
      { $match: { createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: "$payment_method",
          total: { $sum: "$total_amount" },
          paid: { $sum: { $ifNull: ["$paid_amount", 0] } },
          orders: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          method: "$_id",
          total: 1,
          paid: 1,
          orders: 1,
          debt: { $max: [{ $subtract: ["$total", "$paid"] }, 0] },
        },
      },
      { $sort: { total: -1 } },
    ];

    const topProductsPipeline = [
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { $unwind: "$products" },
      {
        $group: {
          _id: {
            id: "$products.product_id",
            name: "$products.name",
            unit: "$products.unit",
          },
          qty: { $sum: "$products.quantity" },
          revenue: {
            $sum: { $multiply: ["$products.price", "$products.quantity"] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          product_id: "$_id.id",
          name: "$_id.name",
          unit: "$_id.unit",
          qty: 1,
          revenue: 1,
        },
      },
      { $sort: { qty: -1, revenue: -1 } },
      { $limit: 5 },
    ];

    const [series, summaryArr, paymentBreakdown, topProducts] =
      await Promise.all([
        Sale.aggregate(seriesPipeline),
        Sale.aggregate(summaryPipeline),
        Sale.aggregate(paymentBreakdownPipeline),
        Sale.aggregate(topProductsPipeline),
      ]);

    const summary = summaryArr[0] || {
      total: 0,
      paid: 0,
      debt: 0,
      orders: 0,
      aov: 0,
      profit: 0,
    };

    res.json({
      success: true,
      range: { start, end, granularity },
      summary,
      series,
      paymentBreakdown,
      topProducts,
    });
  } catch (err) {
    console.error("getSalesStats error:", err);
    res.status(500).json({
      success: false,
      message: "Statistika hisoblashda xatolik",
      error: err.message,
    });
  }
};
