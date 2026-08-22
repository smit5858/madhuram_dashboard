const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const chalk = require("chalk");
const logger = require("./helper/logger");
const auth = require("./routes/auth.routes");
require("dotenv").config();

const sequelize = require("./config/db");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev", { stream: { write: (msg) => logger.info(msg.trim()) } }));

const permissions = require("./routes/permission.routes");
const couriers = require("./routes/courier.routes");

app.get("/", (req, res) => res.send("API running"));
app.use("/auth", auth);
app.use("/permissions", permissions);
app.use("/couriers", couriers);


const PORT = process.env.PORT || 3000;

sequelize
  .authenticate()
  .then(() => {
    console.log(chalk.green("✔ DB connected"));
    logger.info("DB connected");
    return sequelize.sync({ alter: true });
  })
  .then(() => {
    logger.info("Models synced");
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      console.log(chalk.cyan(`🚀 Server running on port ${PORT}`));
    });
  })
  .catch((err) => {
    logger.error(`DB connection failed: ${err && err.stack ? err.stack : err}`);
    console.log(chalk.red("✘ DB connection failed:"), err && err.stack ? err.stack : err);
  });


  