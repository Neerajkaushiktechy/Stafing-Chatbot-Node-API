const pool = require('../db.js');
const axios = require('axios');

async function create_shift(created_by,nurse_type, shift, location, hospital_name,date, start_time, end_time, nurse_id=null, status="open")
{
    try {
        const result = await pool.query(`
          INSERT INTO shift_tracker 
          (created_by, hospital_name, location, nurse_type, shift, nurse_id, status, date, start_time, end_time)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id
        `, [created_by, hospital_name, location, nurse_type, shift, nurse_id, status, date, start_time,end_time]); // You can set 'created_by' to 'admin' or your logic
    
        console.log('Shift created successfully');
        console.log("shift id",result.rows[0].id )
        return result.rows[0].id;
    }catch (err) {
        console.error('Error creating tables:', err);
      }
}

async function check_shift_status(shift_id) {
  const { rows } = await pool.query(
    `SELECT status
     FROM shift_tracker
     WHERE id = $1`,
    [shift_id]
  );

  if (rows.length > 0) {
    return rows[0].status;
  } else {
    return null; // or throw an error if shift_id not found
  }
}
module.exports = {
    create_shift,
    check_shift_status
}