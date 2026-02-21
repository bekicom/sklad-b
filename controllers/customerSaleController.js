const Sale = require("../models/Sale");
const Customer = require("../models/Customer");
const Store = require("../models/Store");

// 🛒 Dokonga sotuv yaratish
exports.createCustomerSale = async (req, res) => {
  try {
    const { customer, products, paid_amount = 0, payment_method } = req.body;

    let customerData;

    if (customer._id) {
      customerData = await Customer.findById(customer._id);
    } else {
      customerData = await Customer.create({
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        totalPurchased: 0,
        totalPaid: 0,
        totalDebt: 0,
      });
    }

    let total_amount = 0;
    let saleProducts = [];

    for (let p of products) {
      const product = await Store.findById(p.product_id);
      if (!product || product.quantity < p.quantity) {
        return res.status(400).json({
          message: `${product?.product_name || "Mahsulot"} omborda yetarli emas`,
        });
      }

      product.quantity -= p.quantity;
      await product.save();

      const price = p.price || product.sell_price;

      saleProducts.push({
        product_id: product._id,
        name: product.product_name,
        unit: product.unit,
        price,
        quantity: p.quantity,
        currency: product.currency,
        partiya_number: product.partiya_number,
      });

      total_amount += price * p.quantity;
    }

    const remaining_debt = Math.max(total_amount - paid_amount, 0);

    const sale = await Sale.create({
      customer_id: customerData._id,
      products: saleProducts,
      total_amount,
      paid_amount,
      remaining_debt,
      payment_method,
      payment_history:
        paid_amount > 0 ? [{ amount: paid_amount, date: new Date() }] : [],
    });

    // ✅ BALANSNI TO‘G‘RI YANGILASH
    customerData.totalPurchased =
      (customerData.totalPurchased || 0) + total_amount;

    customer.totalPaid = (customer.totalPaid || 0) + amount;

    customer.totalDebt = Math.max(
      (customer.totalPurchased || 0) - customer.totalPaid,
      0,
    );

    await customerData.save();

    res.json({ success: true, sale });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};





// 📄 Barcha mijozlar
exports.getAllCustomers = async (req, res) => {
  try {
    const customers = await Customer.find();
    res.status(200).json(customers);
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({ message: "Serverda xatolik", err });
  }
};

// 📄 Barcha mijoz sotuvlari
exports.getAllCustomerSales = async (req, res) => {
  try {
    const sales = await Sale.find()
      .populate("customer_id")
      .sort({ createdAt: -1 });

    res.json({ success: true, sales });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 📌 Qarzga olgan mijozlar
exports.getCustomerDebtors = async (req, res) => {
  try {
    const debtors = await Sale.find({ payment_method: "qarz" })
      .populate("customer_id")
      .sort({ createdAt: -1 });

    res.json({ success: true, debtors });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 💰 Mijoz qarz to'lashi
exports.payCustomerDebt = async (req, res) => {
  try {
    const { amount } = req.body;
    const customer = await Customer.findById(req.params.id);

    if (!customer) return res.status(404).json({ message: "Mijoz topilmadi" });

    const lastDebtSale = await Sale.findOne({
      customer_id: customer._id,
      payment_method: "qarz",
      $expr: { $lt: ["$paid_amount", "$total_amount"] },
    }).sort({ createdAt: 1 });

    if (!lastDebtSale) {
      return res.status(400).json({ message: "Qarz sotuv topilmadi" });
    }

    lastDebtSale.paid_amount += amount;
    lastDebtSale.remaining_debt = Math.max(
      lastDebtSale.total_amount - lastDebtSale.paid_amount,
      0
    );

    lastDebtSale.payment_history.push({
      amount,
      date: new Date(),
    });

    await lastDebtSale.save();

    customer.total_paid += amount;
    customer.total_debt = Math.max(
      customer.total_given - customer.total_paid,
      0
    );
    await customer.save();

    res.json({ success: true, sale: lastDebtSale, customer });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 💸 Mijoz qarzini oshirish
exports.addCustomerDebt = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;

    const customer = await Customer.findByIdAndUpdate(id, {
      $inc: { totalDebt: amount },
    });

    res.status(200).json({ message: "Qarz qo'shildi" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 🗑️ Mijozni o'chirish (YANGI)
exports.deleteCustomer = async (req, res) => {
  try {
    const mongoose = require("mongoose");
    const customerId = req.params.id;

   

    // ID formatini tekshirish
    if (!customerId || customerId === "undefined" || customerId === "null") {
      return res.status(400).json({ message: "Customer ID noto'g'ri" });
    }

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ message: "Customer ID formati noto'g'ri" });
    }

    // Customer mavjudligini tekshirish
    const customer = await Customer.findById(customerId);

    if (!customer) {
      console.log("❌ Customer topilmadi:", customerId);
      return res.status(404).json({ message: "Mijoz topilmadi" });
    }


    // Customer bilan bog'liq sotuvlarni tekshirish
    const salesCount = await Sale.countDocuments({ customer_id: customerId });

    // Variant 1: Sotuvlarni ham o'chirish
    if (salesCount > 0) {
      await Sale.deleteMany({ customer_id: customerId });
    }

    // Variant 2: Yoki faqat customer_id ni null qilish (izohdan chiqaring agar kerak bo'lsa)
    // if (salesCount > 0) {
    //   await Sale.updateMany(
    //     { customer_id: customerId },
    //     { $set: { customer_id: null } }
    //   );
    //   console.log("✅ Sotuvlardan customer_id olib tashlandi");
    // }

    // Customerni o'chirish
    await Customer.findByIdAndDelete(customerId);

    res.status(200).json({
      message: "Mijoz muvaffaqiyatli o'chirildi",
      success: true,
      deletedCustomer: {
        id: customerId,
        name: customer.name,
      },
    });
  } catch (err) {
    console.error("Customer o'chirish xatosi:", err);
    res.status(500).json({
      message: "Mijozni o'chirishda xatolik",
      error: err.message,
    });
  }
};

// 📄 Barcha mijoz sotuvlari
exports.getAllCustomerSales = async (req, res) => {
  try {
    const { customerId } = req.query; // ✅ customerId ni olamiz

    const filter = {};
    if (customerId) {
      filter.customer_id = customerId; // ✅ Faqat shu mijozning sotuvlari
    }

    const sales = await Sale.find(filter)
      .populate("customer_id")
      .sort({ createdAt: -1 });

    res.json(sales); // ✅ To'g'ridan array qaytarish (frontend shunday kutayapti)
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};