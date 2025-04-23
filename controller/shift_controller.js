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

async function search_shift(nurse_type, shift, location, hospital_name, date, start_time, end_time, created_by) {
  const { rows } = await pool.query(`
    SELECT * FROM shift_tracker
    WHERE nurse_type ILIKE $1
      AND shift ILIKE $2
      AND location ILIKE $3
      AND hospital_name ILIKE $4
      AND date = $5
      AND start_time = $6
      AND end_time = $7
      AND created_by = $8
  `, [nurse_type, shift, location, hospital_name, date, start_time, end_time, created_by]);

  if (rows.length > 0) {
    const shift_id = rows[0].id;
    const nurse_id = rows[0].nurse_id;
    const nurse_type = rows[0].nurse_type;
    const shift_value = rows[0].shift;
    const hospital_name = rows[0].hospital_name;
    const location = rows[0].location;
    const date = rows[0].date;
    const start_time = rows[0].start_time;
    const end_time = rows[0].end_time;
    console.log("shift found with id", shift_id)
    await delete_shift(shift_id,created_by,nurse_id,nurse_type,shift_value,hospital_name,location,date,start_time,end_time);
  } else {
    try {
      console.log("shift not found")
      const message = `The cancellation request you raised for the ${nurse_type} nurse for ${shift} shift at ${hospital_name}, ${location} scheduled on ${date} from ${start_time} to ${end_time} does not exist or has been deleted already`
        const response = await axios.post(`${process.env.HOST_MAC}/send_message/`, {
          recipient: created_by,
          message: message,
        });
      } 
    catch (error) {
        console.error(`Failed to send message:`, error.response ? error.response.data : error.message);
      }
  }
}

async function delete_shift(shift_id,created_by,nurse_id,nurse_type,shift_value,hospital_name,location,date,start_time,end_time) {
  try {
    await pool.query(`DELETE FROM shift_tracker WHERE id = $1`, [shift_id]);
    console.log(`Deleted shift with ID: ${shift_id}`);
        try {
          const message = `The cancellation request you raised for the ${nurse_type} nurse for ${shift_value} shift at ${hospital_name}, ${location} scheduled on ${date} from ${start_time} to ${end_time} has been cancelled succesfully`
            const response = await axios.post(`${process.env.HOST_MAC}/send_message/`, {
              recipient: created_by,
              message: message,
            });
          } 
        catch (error) {
            console.error(`Failed to send message:`, error.response ? error.response.data : error.message);
          }
        
       try {
          const {rows} = await pool.query(
            `SELECT mobile_number
            FROM nurses
            WHERE id = $1
            `, [nurse_id]
          )
          const nurse_phoneNumber = rows[0].mobile_number
          const message = `The shift you confirmed at ${hospital_name}, ${location} scheduled on ${date} from ${start_time} to ${end_time} has been cancelled by the coordinator. We are sorry for any inconvinience caused`
            const response = await axios.post(`${process.env.HOST_MAC}/send_message/`, {
              recipient: nurse_phoneNumber,
              message: message,
            });
            console.log("nurse informed about cancellation")
          } 
        catch (error) {
            console.error(`Failed to send message:`, error.response ? error.response.data : error.message);
          }
     
  } catch (error) {
    console.error('Error deleting shift:', error);
  }
}

module.exports = {
    create_shift,
    check_shift_status,
    search_shift
}