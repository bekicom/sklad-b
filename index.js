const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");

// 📌 .env faylni yuklash
dotenv.config();

// 📌 App yaratish
const app = express();

// 📌 Middlewarelar
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// 📌 MongoDBga ulanish
const connectDB = require("./config/db");
connectDB();

// 📌 Main Router
const mainRouter = require("./routes/mainRouter");
app.use("/api", mainRouter);

// 📌 Xatoliklar uchun universal middleware (optional)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res
    .status(500)
    .json({ message: "Serverda xatolik yuz berdi", error: err.message });
});

// 📌 Serverni ishga tushirish
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server ${PORT}-portda ishlamoqda`);
});
