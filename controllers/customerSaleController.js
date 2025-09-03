const Sale = require("../models/Sale");
const Customer = require("../models/Customer");
const Store = require("../models/Store");

// 🛒 Dokonga sotuv yaratish
exports.createCustomerSale = async (req, res) => {
  try {
    const { customer, products, paid_amount, payment_method } = req.body;

    let customerData;
    if (customer._id) {
      customerData = await Customer.findById(customer._id);
    } else {
      customerData = await Customer.create({
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        total_given: 0,
        total_paid: 0,
        total_debt: 0,
      });
    }

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

      product.quantity -= p.quantity;
      await product.save();

      saleProducts.push({
        product_id: product._id,
        name: product.product_name,
        unit: product.unit,
        price: p.price || product.sell_price,
        purchase_price: product.unit_price,
        quantity: p.quantity,
        currency: product.currency,
        partiya_number: product.partiya_number,
      });

      total_amount += (p.price || product.sell_price) * p.quantity;
    }

    const remaining_debt = total_amount - paid_amount;

    const sale = await Sale.create({
      customer_id: customerData._id,
      products: saleProducts,
      total_amount,
      paid_amount,
      remaining_debt,
      payment_method,
      paymentHistory:
        paid_amount > 0 ? [{ amount: paid_amount, date: new Date() }] : [],
    });

    customerData.total_given += total_amount;
    customerData.total_paid += paid_amount;
    customerData.total_debt =
      customerData.total_given - customerData.total_paid;
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


exports.addCustomerDebt = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;
    console.log(id);
    console.log(amount);

    const customer = await Customer.findByIdAndUpdate(id, {
      $inc: { totalDebt: amount },
    });
    console.log(customer);
    
    res.status(200).json({ message: "Qarz qo'shildi" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
