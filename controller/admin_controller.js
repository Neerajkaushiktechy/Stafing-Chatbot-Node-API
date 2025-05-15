const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const router = require('../routes/nurseRoutes');
const pool = require('../db');
const { sendMessage } = require('../services/sendMessageAPI');
async function admin_login(req, res) {
    try {
        const { email, password } = req.body;
        const result = await pool.query(`
            SELECT * FROM admin
            WHERE email = $1
        `, [email]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Invalid Credentials", status: 404 });
        }

        const user = result.rows[0];
        const password_check = await bcrypt.compare(password, user.password);
        if (!password_check) {
            return res.status(404).json({ message: "Invalid Credentials", status: 404 });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1d' });

        // Set the token in an HTTP-only cookie
        res.cookie('auth_token', token, {
            httpOnly: true,  // Makes the cookie inaccessible to JavaScript
            sameSite: 'Strict', // Prevents CSRF attacks
            maxAge: 24 * 60 * 60 * 1000 // Token expiration time (1 day)
        });

        // Include the token in the response for frontend storage (if needed)
        res.status(200).json({
            message: "Login successful",
            user: { id: user.id, email: user.email },
            token, // Include the token in the response
            status: 200
        });
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
            name, address, cityStateZip, multiplier, nurses, coordinators
        } = req.body;

        for (const coordinator of coordinators) {
            const phone_number = await client.query(`
                SELECT * FROM coordinator
                WHERE coordinator_phone = $1 OR coordinator_email = $2
            `, [coordinator.phone,coordinator.email]);

            if (phone_number.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.json({
                    message: "Facility with this phone number already exists",
                    status: 400
                });
            }
        }

        const facilityInsert = await client.query(`
            INSERT INTO facilities
            (name, address, city_state_zip, overtime_multiplier)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `, [name, address, cityStateZip,multiplier]);

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
        for (const coordinator of coordinators) {
            await client.query(`
                INSERT INTO coordinator
                (facility_id, coordinator_first_name, coordinator_last_name, coordinator_phone, coordinator_email)
                VALUES ($1, $2, $3, $4, $5)
            `, [
                facilityId, coordinator.firstName, coordinator.lastName, coordinator.phone, coordinator.email
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
            name, address, cityStateZip, multiplier,
            nurses, coordinators
        } = req.body;
        
        await client.query('BEGIN');
        
        for (const coordinator of coordinators) {
            const phone_number = await client.query(`
                SELECT * FROM coordinator
                WHERE (coordinator_phone = $1 OR coordinator_email = $2) AND id!= $3
            `, [coordinator.phone,coordinator.email,coordinator.id]);

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
            SET name = $1, address = $2, city_state_zip = $3, overtime_multiplier = $4
            WHERE id = $5
        `, [name, address, cityStateZip, multiplier, id]);
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
        for (const coordinator of coordinators) {
            if(coordinator.id){
                await client.query(`
                    UPDATE coordinator
                    SET coordinator_first_name = $2, coordinator_last_name = $3, coordinator_phone = $4, coordinator_email = $5
                    WHERE id = $1
                `, [coordinator.id, coordinator.firstName, coordinator.lastName, coordinator.phone, coordinator.email]);
            }
            else{
                await client.query(`
                    INSERT INTO coordinator
                    (facility_id, coordinator_first_name, coordinator_last_name, coordinator_phone, coordinator_email)
                    VALUES ($1, $2, $3, $4, $5)
                `, [
                    id, coordinator.firstName, coordinator.lastName, coordinator.phone, coordinator.email
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
      const { search, page, limit, noPagination } = req.query;
      const searchTerm = search ? `%${search}%` : null;
  
      const baseQuery = `
        FROM facilities
        ${searchTerm ? `WHERE name ILIKE $1 OR city_state_zip ILIKE $1` : ''}
      `;
  
      if (noPagination === 'true') {
        const query = `
          SELECT * ${baseQuery}
          ORDER BY name ASC
        `;
        const { rows } = await pool.query(query, searchTerm ? [searchTerm] : []);
        return res.json({ facilities: rows, status: 200, noPagination: true });
      }
  
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      const offset = (pageNum - 1) * limitNum;
  
      // Get total count
      const countQuery = `SELECT COUNT(*) ${baseQuery}`;
      const countResult = await pool.query(countQuery, searchTerm ? [searchTerm] : []);
      const total = parseInt(countResult.rows[0].count);
  
      // Get paginated data
      const dataQuery = `
        SELECT * ${baseQuery}
        ORDER BY name ASC
        LIMIT $${searchTerm ? 2 : 1} OFFSET $${searchTerm ? 3 : 2}
      `;
      const values = searchTerm ? [searchTerm, limitNum, offset] : [limitNum, offset];
      const { rows } = await pool.query(dataQuery, values);
  
      return res.json({
        facilities: rows,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        },
        status: 200
      });
    } catch (error) {
      console.error("Error fetching facilities:", error.message);
      return res.status(500).json({ message: "Server error", status: 500 });
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
        const {rows: coordinators} = await pool.query(`
            SELECT * FROM coordinator
            WHERE facility_id = $1`,
            [id])
        return res.json({ facilities: rows[0], services: services.rows, coordinators: coordinators,status: 200 });
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
        const search = req.query.search?.trim();

        let baseQuery = `SELECT * FROM nurses`;
        let countQuery = `SELECT COUNT(*) FROM nurses`;
        let queryParams = [];
        let conditions = [];

        if (search) {
            conditions.push(`(first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1 OR mobile_number ILIKE $1 OR shift ILIKE $1 OR nurse_type ILIKE $1)`);
            queryParams.push(`%${search}%`);
        }

        if (conditions.length > 0) {
            baseQuery += ` WHERE ${conditions.join(" AND ")}`;
            countQuery += ` WHERE ${conditions.join(" AND ")}`;
        }

        baseQuery += ` ORDER BY last_name ASC, first_name ASC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
        queryParams.push(limit, offset);

        // Get count with same conditions
        const countResult = await pool.query(countQuery, conditions.length ? [queryParams[0]] : []);
        const total = parseInt(countResult.rows[0].count);

        // Get paginated data
        const { rows } = await pool.query(baseQuery, queryParams);

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
        const {firstName, lastName, scheduleName, rate, shiftDif, otRate, email, talentId, position, phone, location, shift} = req.body
        const { rows } = await pool.query(`
            SELECT * FROM nurses
            WHERE email = $1 OR mobile_number = $2
        `,[email,phone])
        if(rows.length > 0){
            return res.json({message:"Nurse with this email or phone number already exists", status:400, nurse:rows[0]})
        }
        await pool.query(`
            INSERT INTO nurses
            (first_name, last_name, schedule_name, rate, shift_dif, ot_rate, email, talent_id, nurse_type, mobile_number,location, shift)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [firstName,lastName,scheduleName,rate,shiftDif,otRate,email,talentId,position, phone,location,shift])
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
        const { id } = req.params;
        const {firstName, lastName, scheduleName, rate, shiftDif, otRate, email, talentId, position, phone, location,shift } = req.body
        const { rows } = await pool.query(`
            SELECT * FROM nurses
            WHERE (email = $1 OR mobile_number = $2) AND id != $3
        `,[email,phone,id])
        if(rows.length > 0){
            return res.json({message:"Nurse with this email or phone number already exists", status:400, nurse:rows[0]})
        }
        await pool.query(`
            UPDATE nurses
            SET first_name = $1, last_name = $2, schedule_name = $3, rate = $4, shift_dif = $5, ot_rate = $6, email = $7, talent_id = $8, nurse_type = $9, mobile_number = $10, location = $12, shift = $13
            WHERE id = $11`,
        [firstName,lastName,scheduleName,rate,shiftDif,otRate,email,talentId,position, phone, id, location, shift])
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

async function get_nurse_types(req, res) {
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

router.delete('/delete-nurse-type/:id', delete_nurse_type)

async function delete_nurse_type(req, res) {
    try {
        const { id } = req.params;
        const {rows} = await pool.query(`
            SELECT * FROM nurse_type
            WHERE id = $1`,
            [id]);
        const nurse_type = rows[0].nurse_type

        await pool.query(`
            DELETE FROM nurse_type
            WHERE id = $1`,
            [id]
        );
        await pool.query(`
            DELETE FROM shifts
            WHERE role ILIKE $1`,
            [nurse_type]
        );
        await pool.query(`
            DELETE FROM nurses
            WHERE nurse_type ILIKE $1`,
            [nurse_type]
        );
        await pool.query(`
            DELETE FROM shift_tracker
            WHERE nurse_type ILIKE $1`,
            [nurse_type]
        );
        res.json({ message: "Nurse type deleted successfully", status: 200 });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "An error has occurred", status: 500 });
    }
}

async function edit_nurse_type(req, res) {
    try {
        const { id } = req.params;
        const { nurse_type } = req.body;
        const { rows } = await pool.query(`
            SELECT * FROM nurse_type
            WHERE id = $1`,
            [id]);
        const old_nurse_type = rows[0].nurse_type
        await pool.query(`
            UPDATE nurse_type
            SET nurse_type = $1
            WHERE id = $2`,
            [nurse_type, id]
        );
        await pool.query(`
            UPDATE shifts
            SET role = $1
            WHERE role ILIKE $2`,
            [nurse_type, old_nurse_type]
        );
        await pool.query(`
            UPDATE nurses
            SET nurse_type = $1
            WHERE nurse_type ILIKE $2`,
            [nurse_type, old_nurse_type]
        );
        await pool.query(`
            UPDATE shift_tracker
            SET nurse_type = $1
            WHERE nurse_type ILIKE $2`,
            [nurse_type, old_nurse_type]
        );
        res.json({ message: "Nurse type updated successfully", status: 200 });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "An error has occurred", status: 500 });
    }
}

async function get_shifts(req, res) {
    const { nurseType, facility, shift, status, name } = req.query;
  
    const filters = [];
    const values = [];
    if (nurseType) {
      values.push(nurseType);
      filters.push(`nurse_type = $${values.length}`);
    }
    if (shift) {
      values.push(shift);
      filters.push(`shift = $${values.length}`);
    }
    if (status) {
      values.push(status);
      filters.push(`status = $${values.length}`);
    }
    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const query = `SELECT * FROM shift_tracker ${whereClause} ORDER BY date, shift`;
    if (facility) {
        const {rows: facilities} = await pool.query(`
            SELECT * FROM facilities
            WHERE name = $1`,
            [facility]);
        }
    try {
      const result = await pool.query(query, values);
      const events = [];
      for (const row of result.rows) {
        const { facility_id, nurse_type, shift: shiftValue, date } = row;
        const {rows: nurse} = await pool.query(`
            SELECT first_name, last_name FROM nurses
            where id = $1`,
            [row.nurse_id])
        if (row.nurse_id == null){
            var nurse_name = "Not assigned"
        }
        else{
            nurse_name = nurse[0].first_name + " " + nurse[0].last_name
        }
        // Get shift timings
        const { rows: shiftRows } = await pool.query(
          `SELECT * FROM shifts WHERE facility_id = $1 AND role ILIKE $2 `,
          [facility_id, nurse_type]
        );
        if (!shiftRows.length) continue;
        const {
          am_time_start, am_time_end,
          pm_time_start, pm_time_end,
          noc_time_start, noc_time_end
        } = shiftRows[0];
  
        // Get correct times based on shift
        let startTime, endTime;
        if (shiftValue === 'AM') {
          startTime = am_time_start;
          endTime = am_time_end;
        } else if (shiftValue === 'PM') {
          startTime = pm_time_start;
          endTime = pm_time_end;
        } else if (shiftValue === 'NOC') {
          startTime = noc_time_start;
          endTime = noc_time_end;
        }
  
        // Construct datetime strings for FullCalendar
        const localDate = new Date(date);
        const year = localDate.getFullYear();
        const month = String(localDate.getMonth() + 1).padStart(2, '0');
        const day = String(localDate.getDate()).padStart(2, '0');
        const formattedDate = `${year}-${month}-${day}`;
        const start = `${formattedDate}T${startTime}`;
        const end = `${formattedDate}T${endTime}`;

        const {rows: facility} = await pool.query(`
            SELECT name FROM facilities
            WHERE id = $1`,
            [facility_id])
        const name = facility[0].name
        events.push({
          id: row.id,
          title: `${row.nurse_type} at ${name}`,
          start,
          end,
          extendedProps: {
            nurse_type: row.nurse_type,
            facility: name,
            status: row.status,
            date: row.date,
            shift: row.shift,
            nurse: nurse_name,
            
          },
        });
      }
      res.json({ events, status: 200 });
    } catch (err) {
      console.error('Error fetching shifts:', err);
      res.status(500).json({ error: 'Failed to fetch shifts' });
    }
  }

  async function delete_coordinator(req,res){
    try {
        const {id} = req.params
        await pool.query(`
            DELETE FROM coordinator
            WHERE id = $1`,
            [id])
        res.json({message:"Coordinator deleted successfully", status:200})
    } catch (error) {
        res.status(500).json({message:"An Error has occured",status:500})
        console.error(error)
    }
  }

async function get_all_shifts(req, res) {
  try {
    const { search } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const searchTerm = search ? `%${search.toLowerCase()}%` : null;

    let query, countQuery, values, countValues;

    if (searchTerm) {
      query = `
        SELECT 
          s.*, 
          CONCAT(n.first_name, ' ', n.last_name) AS nurse_name,
          f.name AS facility_name,
          CONCAT(c.coordinator_first_name, ' ', c.coordinator_last_name) AS coordinator_name
        FROM shift_tracker s
        LEFT JOIN nurses n ON s.nurse_id = n.id
        LEFT JOIN facilities f ON s.facility_id = f.id
        LEFT JOIN coordinator c ON s.coordinator_id = c.id
        WHERE 
          LOWER(CONCAT(n.first_name, ' ', n.last_name)) ILIKE $1
          OR LOWER(f.name) ILIKE $1
          OR LOWER(CONCAT(c.coordinator_first_name, ' ', c.coordinator_last_name)) ILIKE $1
          OR LOWER(s.nurse_type) ILIKE $1
          OR LOWER(s.shift) ILIKE $1
          OR LOWER(s.status) ILIKE $1
        ORDER BY s.id DESC
        LIMIT $2 OFFSET $3
      `;

      countQuery = `
        SELECT COUNT(*) AS total
        FROM shift_tracker s
        LEFT JOIN nurses n ON s.nurse_id = n.id
        LEFT JOIN facilities f ON s.facility_id = f.id
        LEFT JOIN coordinator c ON s.coordinator_id = c.id
        WHERE 
          LOWER(CONCAT(n.first_name, ' ', n.last_name)) ILIKE $1
          OR LOWER(f.name) ILIKE $1
          OR LOWER(CONCAT(c.coordinator_first_name, ' ', c.coordinator_last_name)) ILIKE $1
          OR LOWER(s.nurse_type) ILIKE $1
          OR LOWER(s.shift) ILIKE $1
          OR LOWER(s.status) ILIKE $1
      `;

      values = [searchTerm, limit, offset];
      countValues = [searchTerm];
    } else {
      query = `
        SELECT 
          s.*, 
          CONCAT(n.first_name, ' ', n.last_name) AS nurse_name,
          f.name AS facility_name,
          CONCAT(c.coordinator_first_name, ' ', c.coordinator_last_name) AS coordinator_name
        FROM shift_tracker s
        LEFT JOIN nurses n ON s.nurse_id = n.id
        LEFT JOIN facilities f ON s.facility_id = f.id
        LEFT JOIN coordinator c ON s.coordinator_id = c.id
        ORDER BY s.id DESC
        LIMIT $1 OFFSET $2
      `;

      countQuery = `SELECT COUNT(*) AS total FROM shift_tracker`;
      values = [limit, offset];
      countValues = [];
    }

    const [result, countResult] = await Promise.all([
      pool.query(query, values),
      pool.query(countQuery, countValues)
    ]);

    const total = parseInt(countResult.rows[0].total);

    res.json({
      page,
      limit,
      total: total,
      totalPages: Math.ceil(total / limit),
      shifts: result.rows.map(shift => ({
        ...shift,
        nurse_name: shift.nurse_name || "Not assigned",
        coordinator_name: shift.coordinator_name || "Not assigned"
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An Error has occurred", status: 500 });
  }
}

  
  async function delete_shift_admin(req, res) {
    try {
        const { id } = req.params;

        const { rows: shiftDetails } = await pool.query(`
            SELECT coordinator_id, nurse_id, date, shift, nurse_type, status, facility_id
            FROM shift_tracker
            WHERE id = $1`,
            [id]);

        if (shiftDetails.length === 0) {
            return res.status(404).json({ message: "Shift not found", status: 404 });
        }

        const {
            coordinator_id,
            nurse_id,
            date: shiftDate,
            shift: shiftType,
            nurse_type: nurseType,
            status: shiftStatus,
            facility_id
        } = shiftDetails[0];

        const { rows: coordinatorContact } = await pool.query(`
            SELECT coordinator_phone, coordinator_email FROM coordinator
            WHERE id = $1`,
            [coordinator_id]);

        const phone = coordinatorContact[0]?.coordinator_phone;
        const email = coordinatorContact[0]?.coordinator_email;

        const { rows: facility } = await pool.query(`
            SELECT name FROM facilities
            WHERE id = $1`,
            [facility_id]);

        const facilityName = facility[0]?.name || "Unknown Facility";

        const message = `Hello, the shift for ${nurseType} on ${shiftDate} for ${shiftType} shift at ${facilityName} has been deleted by the admin.`;

        if (phone) sendMessage(phone, message);
        if (email) sendMessage(email, message);

        if (nurse_id) {
            const { rows: nurseContact } = await pool.query(`
                SELECT mobile_number, email FROM nurses
                WHERE id = $1`,
                [nurse_id]);

            const nursePhone = nurseContact[0]?.mobile_number;
            const nurseEmail = nurseContact[0]?.email;

            if (shiftStatus === 'filled') {
                if (nursePhone) sendMessage(nursePhone, message);
                if (nurseEmail) sendMessage(nurseEmail, message);
            }
        }

        await pool.query(`
            DELETE FROM shift_tracker
            WHERE id = $1`,
            [id]);

        res.json({ message: "Shift deleted successfully", status: 200 });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "An error has occurred", status: 500 });
    }
}

async function get_coordinators_by_facility(req,res){
    try {
        const {id} = req.params
        const {rows} = await pool.query(`
            SELECT * FROM coordinator
            WHERE facility_id = $1`,
            [id])
        res.json({coordinators:rows, status:200})
    } catch (error) {
        res.status(500).json({message:"An Error has occured",status:500})
        console.error(error)
    }
}

async function get_coordinator_by_id(req, res) {
    try {
        const { id } = req.params;
        const { rows } = await pool.query(`
            SELECT * FROM coordinator
            WHERE id = $1
        `,[id]);
        return res.json({ coordinatorData: rows[0], status: 200 });
    } catch (error) {
        console.error("Error fetching facilities:", error.message);
        return res.status(500).json({ message: "Server error", status: 500 });
    }
}

async function fetch_available_nurses(req, res) {
    try {
        const {facility_id, nurse_type, date, shift} = req.query;
        console.log("FETCH AVAILABLE NURSEs", req.query)
        const {rows: facility} = await pool.query(`
            SELECT * FROM facilities
            WHERE id = $1`,
            [facility_id])
        const facilityLocation = facility[0]?.city_state_zip || '';
        const [city, state, zip] = facilityLocation.split(',').map(part => part.trim()).filter(Boolean);
        const {rows: nurses} = await pool.query(`
            SELECT *
            FROM nurses
            WHERE nurse_type ILIKE $1
              AND shift ILIKE $2
              AND (
                location ILIKE $3
                OR location ILIKE $4
                OR location ILIKE $5
              )
        `, [nurse_type, shift, `%${city}%`, `%${state}%`, `%${zip}%`])
        const nurseIds = nurses.map(nurse => nurse.id);
        console.log("NURSE IDS", nurseIds)
        if (nurseIds.length === 0) {
            console.log("NURSE IDS", nurseIds)
            return res.json({ nurses: [], status: 200 });
          }
          
const { rows: availableNurses } = await pool.query(`
    SELECT n.*
    FROM nurses n
    LEFT JOIN shift_tracker st
      ON n.id = st.nurse_id AND st.date = $2
    WHERE n.id = ANY($1)
      AND st.nurse_id IS NULL
`, [nurseIds, date]);

          console.log("AVAILABLE NURSES", availableNurses)
        res.json({ nurses: availableNurses, status: 200 });
    } catch (error) {
        console.error("Error fetching nurses:", error.message);
        res.status(500).json({ message: "Server error", status: 500 });
    }
}

async function add_shift(req, res) {
    try {
        const {facility,
            coordinator,
            position,
            scheduleDate,
            nurse,
            additionalNotes,
            shift} = req.body;
    await pool.query(`
        INSERT INTO shift_tracker
        (facility_id, coordinator_id, nurse_id, nurse_type, date, shift, status, booked_by, additional_instructions)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [facility, coordinator, nurse, position, scheduleDate, shift, 'filled', 'admin', additionalNotes])
    const {rows: facilityDetails} = await pool.query(`
        SELECT * FROM facilities
        WHERE id = $1`,
        [facility])
    const facilityLocation = facilityDetails[0]?.city_state_zip || '';
    const facilityName = facilityDetails[0]?.name || '';

    const {rows: nurseDetails} = await pool.query(`
        SELECT * FROM nurses
        WHERE id = $1`,
        [nurse])
    const nurseName = nurseDetails[0]?.first_name || '';
    const nurseEmail = nurseDetails[0]?.email || '';
    const nursePhone = nurseDetails[0]?.mobile_number || '';

    const {rows: coordinatorDetails} = await pool.query(`
        SELECT * FROM coordinator
        WHERE id = $1`,
        [coordinator])
    const coordinatorPhone = coordinatorDetails[0]?.coordinator_phone || '';
    const coordinatorEmail = coordinatorDetails[0]?.coordinator_email || '';

    const messageNurse = `A new shift at ${facilityName} ${facilityLocation} on ${scheduleDate} for ${shift} shift. Notes: ${additionalNotes} has been assigned to you by the admin.`
    const messageCoordinator = `A new nurse at ${facilityName} ${facilityLocation} on ${scheduleDate} for ${shift} shift has been booked for you by the admin.`
    sendMessage(nurseEmail, messageNurse)
    sendMessage(coordinatorEmail, messageCoordinator)
    sendMessage(nursePhone, messageNurse)
    sendMessage(coordinatorPhone, messageCoordinator)
        res.json({message:"Shift added successfully", status:200})
    } catch (error) {
        res.status(500).json({message:"An Error has occured",status:500})
        console.error(error)
    }
}

async function get_shift_details_by_id(req, res) {
    try {
        const {id} = req.params;
        const {rows} = await pool.query(`
            SELECT * FROM shift_tracker
            WHERE id = $1`,
            [id])
        res.json({shift:rows[0], status:200})
    } catch (error) {
        res.status(500).json({message:"An Error has occured",status:500})
        console.error(error)
    }
}

async function edit_shift(req, res) {
    try {
        const { id } = req.params;
        const { facility, coordinator, position, scheduleDate, nurse, shift, additionalNotes } = req.body;

        const { rows: existingShiftRows } = await pool.query(`
            SELECT * FROM shift_tracker WHERE id = $1
        `, [id]);

        if (existingShiftRows.length === 0) {
            return res.status(404).json({ message: "Shift not found", status: 404 });
        }

        const existingShift = existingShiftRows[0];
        const {
            nurse_id: oldNurseId,
            coordinator_id: oldCoordinatorId,
            date: oldDate,
            shift: oldShift,
            nurse_type: oldPosition,
            facility_id: oldFacilityId,

        } = existingShift;

        const { rows: facilityRows } = await pool.query(`
            SELECT * FROM facilities WHERE id = $1
        `, [facility]);
        const facilityName = facilityRows[0]?.name || "Unknown Facility";

        // 🧑‍⚕️ Nurse Notification Logic
        if (nurse !== oldNurseId) {
            if (oldNurseId) {
                const { rows: oldNurseRows } = await pool.query(`
                    SELECT first_name, email, mobile_number FROM nurses WHERE id = $1
                `, [oldNurseId]);
                const oldNurse = oldNurseRows[0];
                const message = `Hi ${oldNurse.first_name}, your previously assigned shift for ${oldPosition} on ${oldDate} (${oldShift} shift) at ${facilityName} has been reassigned to another nurse. Thank you for your support.`;
                sendMessage(oldNurse.email, message);
                sendMessage(oldNurse.mobile_number, message);
            }

            if (nurse) {
                const { rows: newNurseRows } = await pool.query(`
                    SELECT first_name, email, mobile_number FROM nurses WHERE id = $1
                `, [nurse]);
                const newNurse = newNurseRows[0];
                const message = `Hi ${newNurse.first_name}, you've been scheduled for a new ${position} shift on ${scheduleDate} (${shift} shift) at ${facilityName}.Notes: ${additionalNotes}`;
                sendMessage(newNurse.email, message);
                sendMessage(newNurse.mobile_number, message);
            }
        } else if (nurse) {
            const { rows: nurseRows } = await pool.query(`
                SELECT first_name, email, mobile_number FROM nurses WHERE id = $1
            `, [nurse]);
            const nurseDetails = nurseRows[0];
            const message = `Hi ${nurseDetails.first_name}, there have been updates to your shift: ${position} on ${scheduleDate} (${shift} shift) at ${facilityName}.Notes: ${additionalNotes}. Please take note of the changes.`;
            sendMessage(nurseDetails.email, message);
            sendMessage(nurseDetails.mobile_number, message);
        }

        // 🧑‍💼 Coordinator Notification Logic
        if (coordinator !== oldCoordinatorId) {
            if (oldCoordinatorId) {
                const { rows: oldCoordinatorRows } = await pool.query(`
                    SELECT coordinator_first_name, coordinator_email, coordinator_phone FROM coordinator WHERE id = $1
                `, [oldCoordinatorId]);
                const oldCoordinator = oldCoordinatorRows[0];
                const message = `Dear ${oldCoordinator.coordinator_first_name}, the coordination responsibility for the ${oldPosition} shift on ${oldDate} (${oldShift} shift) at ${facilityName} has been assigned to another coordinator. Thank you for your efforts.`;
                sendMessage(oldCoordinator.coordinator_email, message);
                sendMessage(oldCoordinator.coordinator_phone, message);
            }

            if (coordinator) {
                const { rows: newCoordinatorRows } = await pool.query(`
                    SELECT coordinator_first_name, coordinator_email, coordinator_phone FROM coordinator WHERE id = $1
                `, [coordinator]);
                const newCoordinator = newCoordinatorRows[0];
                const message = `Dear ${newCoordinator.coordinator_first_name}, you are now responsible for overseeing the ${position} shift on ${scheduleDate} (${shift} shift) at ${facilityName}. Please ensure smooth coordination.`;
                sendMessage(newCoordinator.coordinator_email, message);
                sendMessage(newCoordinator.coordinator_phone, message);
            }
        } else if (coordinator) {
            const { rows: coordinatorRows } = await pool.query(`
                SELECT coordinator_first_name, coordinator_email, coordinator_phone FROM coordinator WHERE id = $1
            `, [coordinator]);
            const coordinatorDetails = coordinatorRows[0];
            const message = `Dear ${coordinatorDetails.coordinator_first_name}, the shift details under your coordination have been updated. New details: ${position} on ${scheduleDate} (${shift} shift) at ${facilityName}.Additional Notes: ${additionalNotes}. Please review.`;
            sendMessage(coordinatorDetails.coordinator_email, message);
            sendMessage(coordinatorDetails.coordinator_phone, message);
        }

        // Update shift in DB
        await pool.query(`
            UPDATE shift_tracker
            SET facility_id = $1, coordinator_id = $2, nurse_id = $3, nurse_type = $4, date = $5, shift = $6, status=$7, additional_instructions = $9
            WHERE id = $8
        `, [facility, coordinator, nurse, position, scheduleDate, shift,'filled' ,id, additionalNotes]);

        res.json({ message: "Shift updated successfully", status: 200 });

    } catch (error) {
        console.error("Error editing shift:", error.message);
        res.status(500).json({ message: "Server error", status: 500 });
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
    delete_service,
    get_nurse_types,
    delete_nurse_type,
    edit_nurse_type,
    get_shifts,
    delete_coordinator,
    get_all_shifts,
    delete_shift_admin,
    get_coordinators_by_facility,
    get_coordinator_by_id,
    fetch_available_nurses,
    add_shift,
    get_shift_details_by_id,
    edit_shift

}