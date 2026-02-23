const mongoose = require("mongoose");
const Sale = require("../models/Sale");
const Customer = require("../models/Customer");
const Store = require("../models/Store");

const toNum = (v) => Number(v) || 0;

async function recalcCustomerTotals(customerId) {
  const allSales = await Sale.find({ customer_id: customerId }).select(
    "total_amount paid_amount",
  );

  const totalPurchased = allSales.reduce(
    (sum, s) => sum + toNum(s.total_amount),
    0,
  );
  const totalPaid = allSales.reduce((sum, s) => sum + toNum(s.paid_amount), 0);
  const totalDebt = Math.max(totalPurchased - totalPaid, 0);

  const customer = await Customer.findById(customerId);
  if (!customer) return null;

  customer.totalPurchased = totalPurchased;
  customer.totalPaid = totalPaid;
  customer.totalDebt = totalDebt;
  await customer.save();

  return customer;
}

// 🛒 Dokonga sotuv yaratish
exports.createCustomerSale = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let { customer, products, paid_amount = 0, payment_method } = req.body;
    paid_amount = toNum(paid_amount);

    if (!customer || (!customer._id && !customer.phone)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Mijoz ma'lumoti to'liq emas" });
    }

    if (!Array.isArray(products) || products.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Mahsulotlar bo'sh bo'lmasin" });
    }

    let customerData;
    if (customer._id) {
      customerData = await Customer.findById(customer._id).session(session);
      if (!customerData) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: "Mijoz topilmadi" });
      }
    } else {
      if (!customer.name) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "Mijoz nomi majburiy" });
      }
      customerData = await Customer.create(
        [
          {
            name: customer.name,
            phone: customer.phone || "",
            address: customer.address || "",
            totalPurchased: 0,
            totalPaid: 0,
            totalDebt: 0,
          },
        ],
        { session },
      );
      customerData = customerData[0];
    }

    let total_amount = 0;
    const saleProducts = [];

    for (const p of products) {
      const qty = toNum(p.quantity);
      if (qty <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "Miqdor noto'g'ri" });
      }

      const product = await Store.findById(p.product_id).session(session);
      if (!product || toNum(product.quantity) < qty) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message: `${product?.product_name || "Mahsulot"} omborda yetarli emas`,
        });
      }

      const price = toNum(p.price) || toNum(product.sell_price);
      product.quantity = toNum(product.quantity) - qty;
      await product.save({ session });

      saleProducts.push({
        product_id: product._id,
        name: product.product_name,
        model: product.model || "",
        unit: product.unit,
        price,
        quantity: qty,
        currency: product.currency,
        partiya_number: product.partiya_number,
      });

      total_amount += price * qty;
    }

    const remaining_debt = Math.max(total_amount - paid_amount, 0);

    if (
      !payment_method ||
      !["cash", "card", "qarz", "mixed"].includes(payment_method)
    ) {
      payment_method =
        remaining_debt > 0 ? (paid_amount > 0 ? "mixed" : "qarz") : "cash";
    }
    if (remaining_debt > 0 && paid_amount > 0) payment_method = "mixed";
    if (remaining_debt > 0 && paid_amount === 0) payment_method = "qarz";

    const created = await Sale.create(
      [
        {
          customer_id: customerData._id,
          products: saleProducts,
          total_amount,
          paid_amount,
          remaining_debt,
          payment_method,
          payment_history:
            paid_amount > 0 ? [{ amount: paid_amount, date: new Date() }] : [],
        },
      ],
      { session },
    );

    const sale = created[0];

    customerData.totalPurchased =
      toNum(customerData.totalPurchased) + total_amount;
    customerData.totalPaid = toNum(customerData.totalPaid) + paid_amount;
    customerData.totalDebt = Math.max(
      toNum(customerData.totalPurchased) - toNum(customerData.totalPaid),
      0,
    );
    await customerData.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.json({ success: true, sale, customer: customerData });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ message: err.message });
  }
};

// 📄 Barcha mijozlar
exports.getAllCustomers = async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });
    return res.status(200).json(customers);
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Serverda xatolik", error: err.message });
  }
};

// 📄 Barcha mijoz sotuvlari (customerId optional)
exports.getAllCustomerSales = async (req, res) => {
  try {
    const { customerId } = req.query;
    const filter = {};
    if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
      filter.customer_id = customerId;
    }

    const sales = await Sale.find(filter)
      .populate("customer_id")
      .sort({ createdAt: -1 });
    return res.json(sales);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// 📌 Qarzga olgan mijozlar
exports.getCustomerDebtors = async (req, res) => {
  try {
    const debtors = await Sale.find({ remaining_debt: { $gt: 0 } })
      .populate("customer_id")
      .sort({ createdAt: -1 });

    return res.json({ success: true, debtors });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// 💰 Mijoz qarz to'lashi (FIFO: eng eski qarzdan boshlab)
exports.payCustomerDebt = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const add = toNum(req.body.amount);
    if (add <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "To'lov summasi noto'g'ri" });
    }

    const customer = await Customer.findById(req.params.id).session(session);
    if (!customer) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Mijoz topilmadi" });
    }

    let left = add;
    const debtSales = await Sale.find({
      customer_id: customer._id,
      remaining_debt: { $gt: 0 },
    })
      .sort({ createdAt: 1 })
      .session(session);

    if (!debtSales.length) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Qarz sotuv topilmadi" });
    }

    for (const s of debtSales) {
      if (left <= 0) break;

      const debt = toNum(s.remaining_debt);
      const pay = Math.min(left, debt);

      s.paid_amount = toNum(s.paid_amount) + pay;
      s.remaining_debt = Math.max(
        toNum(s.total_amount) - toNum(s.paid_amount),
        0,
      );
      s.payment_history.push({ amount: pay, date: new Date() });
      await s.save({ session });

      left -= pay;
    }

    await session.commitTransaction();
    session.endSession();

    const updatedCustomer = await recalcCustomerTotals(customer._id);

    return res.json({
      success: true,
      paid: add - left,
      extra_unapplied: left > 0 ? left : 0,
      customer: updatedCustomer,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ message: err.message });
  }
};

// 💸 Mijoz qarzini oshirish
exports.addCustomerDebt = async (req, res) => {
  try {
    const { id } = req.params;
    const amount = toNum(req.body.amount);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID formati noto'g'ri" });
    }
    if (amount <= 0) {
      return res.status(400).json({ message: "Amount noto'g'ri" });
    }

    const customer = await Customer.findById(id);
    if (!customer) return res.status(404).json({ message: "Mijoz topilmadi" });

    customer.totalDebt = toNum(customer.totalDebt) + amount;
    await customer.save();

    return res
      .status(200)
      .json({ success: true, message: "Qarz qo'shildi", customer });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// 🗑️ Mijozni o'chirish
exports.deleteCustomer = async (req, res) => {
  try {
    const customerId = req.params.id;

    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ message: "Customer ID noto'g'ri" });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ message: "Mijoz topilmadi" });

    await Sale.deleteMany({ customer_id: customerId });
    await Customer.findByIdAndDelete(customerId);

    return res.status(200).json({
      success: true,
      message: "Mijoz muvaffaqiyatli o'chirildi",
      deletedCustomer: { id: customerId, name: customer.name },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Mijozni o'chirishda xatolik",
      error: err.message,
    });
  }
};
