const pool = require('./db');

const createTables = async () => {
  try {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS admin (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
        )
        `)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS facilities (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                address TEXT NOT NULL,
                city_state_zip TEXT NOT NULL,
                phone TEXT NOT NULL UNIQUE,
                overtime_multiplier NUMERIC
            );
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS coordinator_chat_data (
                id SERIAL PRIMARY KEY,
                sender VARCHAR(50) NOT NULL,
                message TEXT NOT NULL,
                message_type TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sender) REFERENCES facilities(phone) ON DELETE CASCADE
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS nurses (
                id SERIAL PRIMARY KEY,
                first_name VARCHAR(255) NOT NULL,
                last_name VARCHAR(255) NOT NULL,
                location VARCHAR(100) NOT NULL,
                nurse_type VARCHAR(50) NOT NULL,
                shift VARCHAR(50) NOT NULL,
                mobile_number VARCHAR(50) NOT NULL UNIQUE,
                schedule_name VARCHAR(50) NOT NULL,
                rate NUMERIC NOT NULL,
                shift_dif NUMERIC NOT NULL,
                ot_rate NUMERIC NOT NULL,
                email VARCHAR(100) NOT NULL UNIQUE,
                talent_id VARCHAR(50) NOT NULL UNIQUE
            );
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS nurse_chat_data (
                id SERIAL PRIMARY KEY,
                mobile_number VARCHAR(100) NOT NULL,
                message TEXT NOT NULL,
                message_type TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
                created_by VARCHAR(100) NOT NULL,
                hospital_name VARCHAR(255) NOT NULL,
                location VARCHAR(100) NOT NULL,
                nurse_type VARCHAR(255) NOT NULL,
                shift VARCHAR(50) NOT NULL,
                nurse_id VARCHAR(50),
                status VARCHAR(50) NOT NULL,
                date DATE NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL
            )`)
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS shifts (
            id SERIAL PRIMARY KEY,
            facility_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            rate NUMERIC NOT NULL,
            hours NUMERIC NOT NULL,
            am_time_start TIME WITHOUT TIME ZONE NOT NULL,
            am_time_end TIME WITHOUT TIME ZONE NOT NULL,
            pm_time_start TIME WITHOUT TIME ZONE NOT NULL,
            pm_time_end TIME WITHOUT TIME ZONE NOT NULL,
            noc_time_start TIME WITHOUT TIME ZONE NOT NULL,
            noc_time_end TIME WITHOUT TIME ZONE NOT NULL,
            am_meal_start TIME WITHOUT TIME ZONE NOT NULL,
            am_meal_end TIME WITHOUT TIME ZONE NOT NULL,
            pm_meal_start TIME WITHOUT TIME ZONE NOT NULL,
            pm_meal_end TIME WITHOUT TIME ZONE NOT NULL,
            noc_meal_start TIME WITHOUT TIME ZONE NOT NULL,
            noc_meal_end TIME WITHOUT TIME ZONE NOT NULL
            )`)
  } catch (err) {
    console.error('Error creating tables:', err);
  }
};

module.exports = createTables;
