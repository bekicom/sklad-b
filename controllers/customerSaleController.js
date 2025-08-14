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

    const sale = await Sale.create({
      customer_id: customerData._id,
      products: saleProducts,
      total_amount,
      paid_amount,
      payment_method,
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

// 💰 Mijoz qarz to‘lashi
exports.payCustomerDebt = async (req, res) => {
  try {
    const { amount } = req.body;
    const sale = await Sale.findById(req.params.id).populate("customer_id");

    if (!sale) return res.status(404).json({ message: "Sotuv topilmadi" });

    sale.paid_amount += amount;
    await sale.save();

    const customer = sale.customer_id;
    customer.total_paid += amount;
    customer.total_debt = customer.total_given - customer.total_paid;
    await customer.save();

    res.json({ success: true, sale, customer });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
