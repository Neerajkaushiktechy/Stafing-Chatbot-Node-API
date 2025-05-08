const pool = require('./db');

const createTables = async () => {
  try {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS admin (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL
        )
        `)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS facilities (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                address TEXT NOT NULL,
                city_state_zip TEXT NOT NULL,
                phone TEXT NOT NULL UNIQUE,
                overtime_multiplier NUMERIC,
                email VARCHAR(255) NOT NULL UNIQUE

            );
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS coordinator_chat_data (
                id SERIAL PRIMARY KEY,
                sender VARCHAR(100) NOT NULL,
                message TEXT,
                message_type TEXT NOT NULL,
                created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sender) REFERENCES facilities(phone) ON DELETE CASCADE
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS nurses (
                id SERIAL PRIMARY KEY,
                first_name VARCHAR(255) NOT NULL,
                last_name VARCHAR(255) NOT NULL,
                location VARCHAR(100) NOT NULL,
                nurse_type VARCHAR(255) NOT NULL,
                shift VARCHAR(255) NOT NULL,
                mobile_number VARCHAR(100) NOT NULL UNIQUE,
                schedule_name VARCHAR(255) NOT NULL,
                rate NUMERIC NOT NULL,
                shift_dif NUMERIC NOT NULL,
                ot_rate NUMERIC NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                talent_id VARCHAR(255) NOT NULL UNIQUE
            );
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS nurse_chat_data (
                id SERIAL PRIMARY KEY,
                mobile_number VARCHAR(100) NOT NULL,
                message TEXT,
                message_type TEXT NOT NULL,
                timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (mobile_number) REFERENCES nurses(mobile_number) ON DELETE CASCADE
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS nurse_type (
            id SERIAL PRIMARY KEY,
            nurse_type VARCHAR(255) NOT NULL UNIQUE
        )`)

        await pool.query(`
            CREATE TABLE IF NOT EXISTS replied_messages (
                id SERIAL PRIMARY KEY,
                text TEXT,
                sender VARCHAR(100),
                timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                rowid INTEGER,
                guid TEXT
            )`)

        await pool.query(`
            CREATE TABLE IF NOT EXISTS shift_tracker (
                id SERIAL PRIMARY KEY,
                facility_id INTEGER NOT NULL,
                nurse_type VARCHAR(255) NOT NULL,
                shift VARCHAR(525) NOT NULL,
                nurse_id INTEGER,
                status VARCHAR(255) NOT NULL,
                date DATE NOT NULL,
                FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE,
                FOREIGN KEY (coordinator_id) REFERENCES coordinator(id) ON DELETE CASCADE
            )`)
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS shifts (
            id SERIAL PRIMARY KEY,
            facility_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            rate NUMERIC NOT NULL,
            hours NUMERIC NOT NULL,
            am_time_start TIME WITHOUT TIME ZONE,
            am_time_end TIME WITHOUT TIME ZONE,
            pm_time_start TIME WITHOUT TIME ZONE,
            pm_time_end TIME WITHOUT TIME ZONE,
            noc_time_start TIME WITHOUT TIME ZONE,
            noc_time_end TIME WITHOUT TIME ZONE,
            am_meal_start TIME WITHOUT TIME ZONE,
            am_meal_end TIME WITHOUT TIME ZONE,
            pm_meal_start TIME WITHOUT TIME ZONE,
            pm_meal_end TIME WITHOUT TIME ZONE,
            noc_meal_start TIME WITHOUT TIME ZONE,
            noc_meal_end TIME WITHOUT TIME ZONE
            )`)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS coordinator (
            id SERIAL PRIMARY KEY,
            facility_id INTEGER NOT NULL,
            coordinator_first_name TEXT NOT NULL,
            coordinator_last_name TEXT NOT NULL,
            coordinator_phone TEXT NOT NULL UNIQUE,
            coordinator_email TEXT NOT NULL UNIQUE,
            FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE
            )
        `)
  } catch (err) { 
    console.error('Error creating tables:', err);
  }
};

module.exports = createTables;
