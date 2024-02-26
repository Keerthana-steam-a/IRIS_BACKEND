const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const { Pool } = require("pg");

const rds_db_config = {
    database: "temp",
    user: 'postgres',
    password: 'mPiJrtZ3lnJRUSWD',
    host: 'ev-db-dev.crjdtlhu0jv9.ap-south-1.rds.amazonaws.com',
    port: 5432,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
};

let pool = null;

const connectWithRetry = () => {
    pool = new Pool(rds_db_config);
};

const app = express();

let corsOptions = {
    origin: "http://localhost:8080/"
};
app.use(cors());

// parse requests of content-type - application/json
app.use(bodyParser.json());

// parse requests of content-type - application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));

//basic route
app.get("/", (req, res) => {
    res.json({ message: "" });
});

app.post("/user", async (req, res) => {
    try {
      const username = req.body.username;
      const userData = await pool.query(
        `SELECT * from "user" WHERE username=$1`,
        [username]
      );

      if (userData.rows[0].user_type === "agent") {
        const stationId = userData.rows[0].station_id;
        const stationData = await pool.query(
          `SELECT * from "stations" WHERE id=$1`,
          [stationId]
        );
        const chargerId = userData.rows[0].charge_point_id;
        const chargerData = await pool.query(
          `SELECT * from "chargers" WHERE id=$1`,
          [chargerId]
        );
        res.json({
          userDetails: userData.rows[0],
          stationDetails: stationData.rows[0],
          chargerDetails: chargerData.rows[0],
        });
      } else if (userData.rows[0].user_type === "lead") {
        const stationId = userData.rows[0].station_id;
        const stationData = await pool.query(
          `SELECT * from "stations" WHERE id=$1`,
          [stationId]
        );
        const chargerData = await pool.query(
          `SELECT * from "chargers" WHERE station_id=$1`,
          [stationId]
        );
        res.json({
          userDetails: userData.rows[0],
          stationDetails: stationData.rows[0],
          chargerDetails: chargerData.rows,
        });
      } else if (userData.rows[0].user_type === "assurance") {
        const chargerData = await pool.query(
          `SELECT * from "chargers" as ch left join stations on ch.station_id=stations.id`
        );
        res.json({
          userDetails: userData.rows[0],
          chargerDetails: chargerData.rows,
        });
      }
    } catch (error) {
      console.error("Error:", error);
      res.status(404).json({ error: true, message: "Username not found" });
    }

});

app.patch("/status", async (req, res) => {
    try {
        const bodyData = req.body;
        const cp_id = bodyData.cp_id;
        const test_cases = bodyData.test_cases
        console.log("test_cases", test_cases)
        const updateData = await pool.query(`UPDATE chargers
        SET test_cases = $1
        WHERE cp_id=$2`, [JSON.stringify(test_cases), cp_id])
        res.send({ message: "Success", data: updateData })
    } catch (error) {
        res.send({ "error": true , reason:error})
        console.log("error", error)
    }
});


// set port, listen for requests
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    connectWithRetry();
    console.log(`Server is running on port ${PORT}`);
});