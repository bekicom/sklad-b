const Debtor = require("../models/debtor.model");

// 🆕 Yangi qarzdor qo'shish
exports.createDebtor = async (req, res) => {
  try {
    const { client, products, total_amount, paid_amount } = req.body;

    const remaining = total_amount - (paid_amount || 0);

    const debtor = await Debtor.create({
      client,
      products,
      total_amount,
      paid_amount: paid_amount || 0,
      remaining_amount: remaining,
      payment_history: paid_amount > 0 ? [{ amount: paid_amount }] : [],
    });

    res.json({ success: true, debtor });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 📜 Barcha qarzdorlarni olish
exports.getDebtors = async (req, res) => {
  try {
    const debtors = await Debtor.find()
      .populate("customer_id", "name phone address") // faqat kerakli maydonlar
      .populate("products.product_id", "name"); // mahsulot nomini olish

    res.json(debtors);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 💵 Qarz to'lash
// controllers/debtorController.js
exports.updateDebtorPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment } = req.body;

    const debtor = await Debtor.findById(id);
    if (!debtor) {
      return res.status(404).json({ message: "Debtor not found" });
    }

    debtor.paidAmount += payment;
    debtor.remainingAmount = debtor.totalAmount - debtor.paidAmount;

    if (debtor.remainingAmount <= 0) {
      debtor.remainingAmount = 0;
    }

    await debtor.save();

    res.json({ message: "Payment updated", debtor });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// ❌ Qarzdorni o'chirish
exports.deleteDebtor = async (req, res) => {
  try {
    const { id } = req.params;
    await Debtor.findByIdAndDelete(id);
    res.json({ success: true, message: "Qarzdor o'chirildi" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// 🔘 Qarz to'lash
exports.payDebt = async (req, res) => {
  try {
    const { amount } = req.body;
    const client = await Client.findById(req.params.clientId);

    if (!client) {
      return res.status(404).json({ message: "Client topilmadi" });
    }

    // Qarzni kamaytirish
    client.totalDebt = Math.max(client.totalDebt - amount, 0);

    // ✅ To'lov tarixiga yozish
    if (!Array.isArray(client.paymentHistory)) {
      client.paymentHistory = [];
    }
    client.paymentHistory.push({
      amount: Number(amount),
      date: new Date()
    });

    await client.save();

    res.status(200).json({
      message: "To'lov qabul qilindi",
      client
    });
  } catch (err) {
    console.error("payDebt error:", err);
    res.status(500).json({
      message: "To'lovda xatolik",
      error: err.message
    });
  }
};



// 🔎 To'lov tarixini olish
exports.getClientPayments = async (req, res) => {
  try {
    const { id } = req.params;

    const client = await Client.findById(id).select(
      "paymentHistory name phone"
    );
    if (!client) {
      return res.status(404).json({ message: "Mijoz topilmadi" });
    }

    res.json(client.paymentHistory || []);
  } catch (error) {
    console.error("getClientPayments error:", error);
    res.status(500).json({ message: "Server xatosi" });
  }
};



