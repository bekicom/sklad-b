const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
const http = require("http");
const { Server } = require("socket.io");

// 📌 .env faylni yuklash
dotenv.config();

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

// 📌 HTTP server yaratamiz
const server = http.createServer(app);

// 📌 Socket.io ulash
const io = new Server(server, {
  cors: {
    origin: "*", // test uchun, kerak bo‘lsa domen qo‘yasan
    methods: ["GET", "POST"],
  },
});

// 📌 io’ni global qilish
app.set("io", io);

io.on("connection", (socket) => {
  console.log("🟢 Client ulandi:", socket.id);

  socket.on("disconnect", () => {
    console.log("🔴 Client chiqdi:", socket.id);
  });
});

// 📌 Xatoliklar uchun universal middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res
    .status(500)
    .json({ message: "Serverda xatolik yuz berdi", error: err.message });
});

// 📌 Serverni ishga tushirish
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server ${PORT}-portda ishlamoqda`);
});
