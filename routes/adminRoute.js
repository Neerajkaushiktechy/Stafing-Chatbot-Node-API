const express = require('express');
const router = express.Router();
const {admin_login,get_nurse_by_id, add_facility, logout, get_facility, get_nurses, add_nurse, add_nurse_type, get_nurse_type, edit_facility, get_facility_by_id, delete_facility,delete_nurse, delete_service, get_nurse_types, delete_nurse_type, edit_nurse_type, edit_nurse} = require('../controller/admin_controller');
const jwt = require('jsonwebtoken');
const authenticateToken = require('../middleware/authenticateToken');

router.post("/login",admin_login) 
router.get('/verify-token', authenticateToken)
router.post('/add-facility', add_facility)
router.put('/edit-facility/:id', edit_facility)
router.get('/check-login', authenticateToken)
router.post('/logout',logout)
router.get('/get-facility',get_facility)
router.get('/get-nurses', get_nurses)
router.post('/add-nurse',add_nurse)
router.put('/edit-nurse/:id',edit_nurse)
router.post('/add-nurse-type',add_nurse_type),
router.get('/get-nurse-type',get_nurse_type),
router.get('/get-facility-by-id/:id',get_facility_by_id)
router.get('/get-nurse-by-id/:id',get_nurse_by_id)
router.delete('/delete-facility/:id',delete_facility)
router.delete('/delete-nurse/:id',delete_nurse)
router.delete('/delete-service/:id/:role',delete_service)
router.get('/get-nurse-types', get_nurse_types)
router.delete('/delete-nurse-type/:id',delete_nurse_type)
router.put('/edit-nurse-type/:id',edit_nurse_type)
module.exports = router;