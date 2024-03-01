const express = require("express");

const bodyParser = require("body-parser");

const cors = require("cors");

const { Pool } = require("pg");

const rds_db_config = {
  database: "temp",

  user: "postgres",

  password: "mPiJrtZ3lnJRUSWD",

  host: "ev-db-dev.crjdtlhu0jv9.ap-south-1.rds.amazonaws.com",

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
  origin: "http://localhost:8080/",
};

app.use(cors());

// parse requests of content-type - application/json

app.use(bodyParser.json());

// parse requests of content-type - application/x-www-form-urlencoded

app.use(bodyParser.urlencoded({ extended: true }));

//basic route
app.get("/userlist", async (req, res) => {
  const user_list = await pool.query(`SELECT username from "user" where user_type='lead'`);
  res.json({ user: user_list.rows });
});
app.get("/", async (req, res) => {
  const test_cases_query = await pool.query(`SELECT name from "test_case" `);

  res.json({ test_case: test_cases_query.rows });
});

app.post("/test_cases", async (req, res) => {
  const { name } = req.body;

  console.log("name", name);

  try {
    await pool.query("INSERT INTO test_case (name) VALUES ($1)", [name]);

    res.status(201).send("Test case added successfully");
  } catch (error) {
    console.error("Error adding new test case:", error);

    res.status(500).send("Internal Server Error");
  }
});

app.patch("/test_cases/:id", async (req, res) => {
  const { id } = req.params;

  const { name } = req.body;

  try {
    await pool.query("UPDATE test_case SET name = $1 WHERE id = $2", [
      name,

      id,
    ]);

    res.status(200).send("Test case updated successfully");
  } catch (error) {
    console.error("Error updating test case:", error);

    res.status(500).send("Internal Server Error");
  }
});

app.delete("/test_cases/:name", async (req, res) => {
  const nameToDelete = req.params.name;

  try {
    await pool.query(`DELETE FROM test_case WHERE name = $1`, [nameToDelete]);

    res.status(200).json({ message: "Test case deleted successfully" });
  } catch (error) {
    console.error("Error deleting test case:", error);

    res.status(500).json({ error: "Failed to delete test case" });
  }
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
      console.log("stationId", stationId);
      const stationData = await pool.query(
        `SELECT * from "stations" WHERE id=$1`,

        [stationId]
      );
      console.log("stationId", stationData.rows);

      const chargerId = userData.rows[0].charge_point_id;

      const chargerData = await pool.query(
        `SELECT * from "chargers" WHERE id=$1`,

        [chargerId]
      );
      console.log("stationId", chargerData.rows);

      res.json({
        userDetails: userData.rows[0],

        stationDetails: stationData.rows[0],

        chargerDetails: chargerData.rows[0],
      });
    } else if (userData.rows[0].user_type === "lead") {
      const stationIds = userData.rows[0].station_id;
      console.log("stationIds", stationIds);

      // Convert stationIds to an array if it's not already
      const stationIdsArray = Array.isArray(stationIds)
        ? stationIds
        : [stationIds];

      const chargerDetails = [];

      for (const stationId of stationIdsArray) {
        const stationData = await pool.query(
          `SELECT * from "stations" WHERE id=$1`,
          [stationId]
        );

        const chargerData = await pool.query(
          `SELECT * from "chargers" WHERE station_id=$1`,
          [stationId]
        );

        const stationDetail = stationData.rows[0];
        const chargersForStation = chargerData.rows;

        chargerDetails.push({
          stationDetails: stationDetail,
          chargers: chargersForStation,
        });
      }

      res.json({
        userDetails: userData.rows[0],
        chargerDetails: chargerDetails,
      });
    } else if (userData.rows[0].user_type === "assurance") {
      const chargerData = await pool.query(
        `SELECT * from "chargers" as ch left join stations on ch.station_id=stations.id`
      );

      const chargerDetails = chargerData.rows.reduce((acc, charger) => {
        if (!acc[charger.station_id]) {
          acc[charger.station_id] = {
            stationDetails: {
              id: charger.station_id,
              location_name: charger.location_name,
              oem_name: charger.oem_name,
            },
            chargers: [],
          };
        }
        acc[charger.station_id].chargers.push({
          id: charger.id,
          cp_id: charger.cp_id,
          test_cases: charger.test_cases,
        });
        return acc;
      }, {});

      res.json({
        userDetails: userData.rows[0],
        chargerDetails: Object.values(chargerDetails),
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

    const test_cases = bodyData.test_cases;

    console.log("test_cases", test_cases);

    const updateData = await pool.query(
      `UPDATE chargers
      SET test_cases = $1
      WHERE cp_id=$2`,
      [JSON.stringify(test_cases), cp_id]
    );

    res.send({ message: "Success", data: updateData });
  } catch (error) {
    res.send({ error: true, reason: error });

    console.log("error", error);
  }
});
app.post("/stations", async (req, res) => {
  const { stationName, oem } = req.body;

  try {
    // Insert station into the stations table
    const stationQuery = await pool.query(
      "INSERT INTO stations (location_name, oem_name) VALUES ($1, $2) RETURNING id",
      [stationName, oem]
    );
    const stationId = stationQuery.rows[0].id;

    res.status(201).json({ stationId, message: "Station added successfully" });
  } catch (error) {
    console.error("Error adding new station:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Endpoint for adding a new charger
app.post("/chargers", async (req, res) => {
  const { stationId, cpId, testCases } = req.body;

  try {
    // Insert charger into the chargers table
    await pool.query(
      "INSERT INTO chargers (station_id, cp_id, test_cases) VALUES ($1, $2, $3)",
      [stationId, cpId, JSON.stringify(testCases)]
    );

    res.status(201).send("Charger added successfully");
  } catch (error) {
    console.error("Error adding new charger:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Endpoint for adding a new user
app.post("/users", async (req, res) => {
  const { username, userType, stationId, cpId } = req.body;
  const charge_point_id = await pool.query(
    `SELECT id from "chargers" where cp_id =$1`,
    [cpId]
  );
  const cp_id = charge_point_id.rows[0].id;
  try {
    // Insert user into the users table
    await pool.query(
      'INSERT INTO "user" (username, user_type, station_id,charge_point_id) VALUES ($1, $2, $3,$4)',
      [username, userType, stationId, cp_id]
    );

    res.status(201).send("User added successfully");
  } catch (error) {
    console.error("Error adding new user:", error);
    res.status(500).send("Internal Server Error");
  }
});
app.patch("/stationassign", async (req, res) => {
  const { username, stationId } = req.body;

  try {
    const getUserResult = await pool.query(
      'SELECT station_id FROM "user" WHERE username = $1',
      [username]
    );
    if (getUserResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    let currentStationId = getUserResult.rows[0].station_id;
    console.log("Current Station ID:", currentStationId);
    if (!Array.isArray(currentStationId)) {
      currentStationId = [currentStationId];
    }
    currentStationId = currentStationId.map(String);
    if (!currentStationId.includes(stationId)) {
      currentStationId.push(stationId);
      console.log("currentStationId", currentStationId);
      const updateResult = await pool.query(
        'UPDATE "user" SET station_id = $1 WHERE username = $2',
        [JSON.stringify(currentStationId), username]
      );

      res.json({ message: "User assigned to station successfully" });
    } else {
      res.json({ message: "Station already assigned to user" });
    }
  } catch (error) {
    console.error("Error assigning user to station:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});










const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  connectWithRetry();

  console.log(`Server is running on port ${PORT}`);
});
