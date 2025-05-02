const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const router = require('../routes/nurseRoutes');
const pool = require('../db');
async function admin_login(req,res){
    try {
        const {email, password} = req.body
        const result = await pool.query(`
            SELECT * FROM admin
            WHERE email = $1
            `,[email])
        if (result.rows.length == 0){
            return res.json({message: "Invalid Credentials",
                                        status: 404
            })
        }
        const user = result.rows[0]
        const hashedPassword = await bcrypt.hash(password, 10);
        const password_check = await bcrypt.compare(password, user.password)
        if (!password_check){
            return res.json({message:"Invalid Credentials",
                                        status:404
            })
        }
        const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.cookie('auth_token', token, {
            httpOnly: true,  // Makes the cookie inaccessible to JavaScript
            sameSite: 'Strict', // Prevents CSRF attacks
            maxAge: 60 * 60 * 1000 // Token expiration time (1 hour)
        });
        res.status(200).json({ message: "Login successful", 
                                user: { id: user.id, email: user.email },
                                status:200 });
    } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: "Server error" });
    }
}

async function logout(req, res) {
    try {
        res.clearCookie('auth_token', {
            httpOnly: true,
            sameSite: 'Strict',
          });
        res.json({ message: "Logout successful", status: 200 }); 
    } catch (error) {
        console.error("ERROR",error)
        res.status(500).json({ message: "Server error" });
    }     
}

async function add_facility(req, res) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            name, city, address, state, zip, multiplier,
            phone, nurses
        } = req.body;
        const cityStateZip = `${city.trim()}, ${state.trim()}, ${zip.trim()}`;

        const phone_number = await client.query(`
            SELECT * FROM facilities
            WHERE phone = $1
        `, [phone]);

        if (phone_number.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.json({
                message: "Facility with this phone number already exists",
                status: 400
            });
        }

        const facilityInsert = await client.query(`
            INSERT INTO facilities
            (name, address, city_state_zip, phone, overtime_multiplier)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `, [name, address, cityStateZip, phone, multiplier]);

        const facilityId = facilityInsert.rows[0].id;

        function timeStringToMs(timeStr) {
            if (!timeStr) return 0;
            const [hours, minutes] = timeStr.split(':').map(Number);
            return ((hours * 60 + minutes) * 60) * 1000;
        }

        for (const nurse of nurses) {
            const workMs = timeStringToMs(nurse.amTimeEnd) - timeStringToMs(nurse.amTimeStart);
            const mealMs = timeStringToMs(nurse.amMealEnd) - timeStringToMs(nurse.amMealStart);
            const netWorkMs = workMs - mealMs;
            const hours = netWorkMs / (1000 * 60 * 60); // Final shift duration in hours

            await client.query(`
                INSERT INTO shifts
                (facility_id, role, am_time_start, am_time_end, pm_time_start, pm_time_end,
                noc_time_start, noc_time_end, am_meal_start, am_meal_end, pm_meal_start,
                pm_meal_end, noc_meal_start, noc_meal_end, rate, hours)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            `, [
                facilityId, nurse.nurseType, nurse.amTimeStart, nurse.amTimeEnd, nurse.pmTimeStart, nurse.pmTimeEnd,
                nurse.nocTimeStart, nurse.nocTimeEnd, nurse.amMealStart, nurse.amMealEnd, nurse.pmMealStart,
                nurse.pmMealEnd, nurse.nocMealStart, nurse.nocMealEnd, nurse.rate, hours
            ]);
        }

        await client.query('COMMIT');
        return res.json({
            message: "Facility added successfully",
            status: 200
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Add facility error:", error.message);
        return res.json({ message: "Server error", status: 500 });
    } finally {
        client.release();
    }
}

async function edit_facility(req, res) {
    const client = await pool.connect();
    try {
        const id = req.params.id;
        const {
            name, city, address, state, zip, multiplier,
            phone, nurses
        } = req.body;
        const cityStateZip = `${city.trim()}, ${state.trim()}, ${zip.trim()}`;
        
        await client.query('BEGIN');
        
        if (phone) {
            const phone_number = await client.query(`
                SELECT * FROM facilities
                WHERE phone = $1 AND id != $2
            `, [phone,id]);

            if (phone_number.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.json({
                    message: "Facility with this phone number already exists",
                    status: 400
                });
            }
        }

        await client.query(`
            UPDATE facilities
            SET name = $1, address = $2, city_state_zip = $3, phone = $4, overtime_multiplier = $5
            WHERE id = $6
        `, [name, address, cityStateZip, phone, multiplier, id]);

        function timeStringToMs(timeStr) {
            if (!timeStr) return 0;
            const [hours, minutes] = timeStr.split(':').map(Number);
            return ((hours * 60 + minutes) * 60) * 1000;
        }

        for (const nurse of nurses) {
            const workMs = timeStringToMs(nurse.amTimeEnd) - timeStringToMs(nurse.amTimeStart);
            const mealMs = timeStringToMs(nurse.amMealEnd) - timeStringToMs(nurse.amMealStart);
            const netWorkMs = workMs - mealMs;
            const hours = netWorkMs / (1000 * 60 * 60); // Final shift duration in hours

            const existingShift = await client.query(`
                SELECT * FROM shifts
                WHERE facility_id = $1 AND role = $2
            `, [id, nurse.nurseType]);
            if (existingShift.rows.length == 0) {
            await client.query(`
                INSERT INTO shifts
                (facility_id,role, am_time_start, am_time_end, pm_time_start, pm_time_end,
                noc_time_start, noc_time_end, am_meal_start, am_meal_end, pm_meal_start,
                pm_meal_end , noc_meal_start , noc_meal_end , rate , hours)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,[
                    id, nurse.nurseType, nurse.amTimeStart, nurse.amTimeEnd, nurse.pmTimeStart, nurse.pmTimeEnd,
                    nurse.nocTimeStart, nurse.nocTimeEnd, nurse.amMealStart, nurse.amMealEnd, nurse.pmMealStart,
                    nurse.pmMealEnd, nurse.nocMealStart, nurse.nocMealEnd, nurse.rate, hours
                ])
            }
            else{
                await client.query(`
                    UPDATE shifts
                    SET role = $2, am_time_start = $3, am_time_end = $4, pm_time_start = $5, pm_time_end = $6,
                    noc_time_start = $7, noc_time_end = $8, am_meal_start = $9, am_meal_end = $10, pm_meal_start = $11,
                    pm_meal_end = $12, noc_meal_start = $13, noc_meal_end = $14, rate = $15, hours = $16
                    WHERE facility_id = $1
                `, [
                    id, nurse.nurseType, nurse.amTimeStart, nurse.amTimeEnd, nurse.pmTimeStart, nurse.pmTimeEnd,
                    nurse.nocTimeStart, nurse.nocTimeEnd, nurse.amMealStart, nurse.amMealEnd, nurse.pmMealStart,
                    nurse.pmMealEnd, nurse.nocMealStart, nurse.nocMealEnd, nurse.rate, hours
                ]);
            }
        }

        await client.query('COMMIT');
        return res.json({
            message: "Facility edited successfully",
            status: 200
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error editing facility:", error.message);
        return res.status(500).json({ message: "Server error", status: 500 });
    }
    finally {
        client.release();
    }
}


async function get_facility(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // Get total count
        const countResult = await pool.query(`
            SELECT COUNT(*) FROM facilities
        `);
        const total = parseInt(countResult.rows[0].count);

        // Get paginated data
        const { rows } = await pool.query(`
            SELECT * FROM facilities
            ORDER BY name ASC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        return res.json({ 
            facilities: rows, 
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            },
            status: 200 
        });
    } catch (error) { 
        console.error("Error fetching facilities:", error.message);
        return res.json({ message: "Server error", status: 500 });
    }
}

async function get_facility_by_id(req, res) {
    try {
        const { id } = req.params;
        const { rows } = await pool.query(`
            SELECT * FROM facilities
            WHERE id = $1
        `,[id]);
        const services = await pool.query(`
            SELECT * FROM shifts
            WHERE facility_id = $1`,
            [id])
        return res.json({ facilities: rows[0], services: services.rows, status: 200 });
    } catch (error) {
        console.error("Error fetching facilities:", error.message);
        return res.status(500).json({ message: "Server error", status: 500 });
    }
}
async function get_nurses(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // Get total count
        const countResult = await pool.query(`
            SELECT COUNT(*) FROM nurses
        `);
        const total = parseInt(countResult.rows[0].count);

        // Get paginated data
        const { rows } = await pool.query(`
            SELECT * FROM nurses
            ORDER BY last_name ASC, first_name ASC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        return res.json({ 
            nurses: rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            },
            status: 200 
        });
    } catch (error) { 
        console.error("Error fetching nurses:", error.message);
        return res.json({ message: "Server error", status: 500 });
    }
}

async function add_nurse(req,res){
    try {
        const {firstName, lastName, scheduleName, rate, shiftDif, otRate, email, talentId, position } = req.body
        await pool.query(`
            INSERT INTO nurses
            (first_name, last_name, schedule_name, rate, shift_dif, ot_rate, email, talent_id, nurse_type)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [firstName,lastName,scheduleName,rate,shiftDif,otRate,email,talentId,position])
        res.json({message:"Nurse added successfully", status:200})
    } catch (error) {
        res.status(500).json({message:"An Error has occured",status:500})
        console.error(error)
    }
}

async function add_nurse_type(req,res){
    try {
        const{nurse_type} = req.body
        await pool.query(`
            INSERT INTO nurse_type
            (nurse_type)
            VALUES ($1)`,
            [nurse_type])
        res.json({message:"Position added successfully", status:200})
    } catch (error) {
        res.status(500).json({message:"An error has occured", status:500})
        console.error(error)
    }
}

async function get_nurse_type(req, res) {
    try {
      const { rows } = await pool.query(`SELECT * FROM nurse_type`);
      res.json({
        message: "Nurse types fetched successfully",
        nurse_types: rows,
        status: 200
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "An error has occurred",
        status: 500
      });
    }
  }
  
  async function get_nurse_by_id(req, res) {
    try {
        const { id } = req.params;
        const { rows } = await pool.query(`
            SELECT * FROM nurses
            WHERE id = $1
        `,[id]);
        return res.json({ nurseData: rows[0], status: 200 });
    } catch (error) {
        console.error("Error fetching facilities:", error.message);
        return res.status(500).json({ message: "Server error", status: 500 });
    }
}

async function edit_nurse(req,res){
    try {
        const {firstName, lastName, scheduleName, rate, shiftDif, otRate, email, talentId, position } = req.body
        await pool.query(`
            UPDATE nurses
            SET first_name = $1, last_name = $2, schedule_name = $3, rate = $4, shift_dif = $5, ot_rate = $6, email = $7, talent_id = $8, nurse_type = $9
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [firstName,lastName,scheduleName,rate,shiftDif,otRate,email,talentId,position])
        res.json({message:"Nurse added successfully", status:200})
    } catch (error) {
        res.status(500).json({message:"An Error has occured",status:500})
        console.error(error)
    }
}

async function delete_nurse(req,res){
    try {
        const {id} = req.params
        await pool.query(`
            DELETE FROM nurses
            WHERE id = $1`,
            [id])
        res.json({message:"Nurse deleted successfully", status:200})
    } catch (error) {
        res.status(500).json({message:"An Error has occured",status:500})
        console.error(error)
    }
}

async function delete_facility(req,res){
    try {
        const {id} = req.params
        await pool.query(`
            DELETE FROM facilities
            WHERE id = $1`,
            [id])
        res.json({message:"Facility deleted successfully", status:200})
    } catch (error) {
        res.status(500).json({message:"An Error has occured",status:500})
        console.error(error)
    }
}

async function delete_service(req,res){
    try {
        const {id,role} = req.params;
        await pool.query(`
            DELETE FROM shifts
            WHERE facility_id = $1 AND role ILIKE $2`,
            [id,role])
        res.json({message:"Service deleted successfully", status:200})
    } catch (error) {
        res.status(500).json({message:"An Error has occurred",status:500})
        console.error(error)
    }
}
module.exports = {
    admin_login,
    add_facility,
    edit_facility,
    logout,
    get_facility,
    get_nurses,
    add_nurse,
    add_nurse_type,
    get_nurse_type,
    get_facility_by_id,
    get_nurse_by_id,
    edit_nurse,
    delete_facility,
    delete_nurse,
    delete_service

}