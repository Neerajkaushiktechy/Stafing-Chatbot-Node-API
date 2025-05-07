const express = require('express');
const router = express.Router();
const {
    admin_login,
    get_nurse_by_id,
    add_facility,
    logout,
    get_facility,
    get_nurses,
    add_nurse,
    add_nurse_type,
    get_nurse_type,
    edit_facility,
    get_facility_by_id,
    delete_facility,
    delete_nurse,
    delete_service,
    get_nurse_types,
    delete_nurse_type,
    edit_nurse_type,
    edit_nurse,
    get_shifts
} = require('../controller/admin_controller');
const authenticateToken = require('../middleware/authenticateToken');

// Public routes
router.post("/login", admin_login);
router.post('/logout', logout);

// Protected routes (require authentication)
router.post('/add-facility', authenticateToken, add_facility);
router.put('/edit-facility/:id', authenticateToken, edit_facility);
router.get('/get-facility', authenticateToken, get_facility);
router.get('/get-facility-by-id/:id', authenticateToken, get_facility_by_id);
router.delete('/delete-facility/:id', authenticateToken, delete_facility);

router.get('/get-nurses', authenticateToken, get_nurses);
router.get('/get-nurse-by-id/:id', authenticateToken, get_nurse_by_id);
router.post('/add-nurse', authenticateToken, add_nurse);
router.put('/edit-nurse/:id', authenticateToken, edit_nurse);
router.delete('/delete-nurse/:id', authenticateToken, delete_nurse);

router.post('/add-nurse-type', authenticateToken, add_nurse_type);
router.get('/get-nurse-type', authenticateToken, get_nurse_type);
router.get('/get-nurse-types', authenticateToken, get_nurse_types);
router.delete('/delete-nurse-type/:id', authenticateToken, delete_nurse_type);
router.put('/edit-nurse-type/:id', authenticateToken, edit_nurse_type);

router.delete('/delete-service/:id/:role', authenticateToken, delete_service);
router.get('/get-shifts', authenticateToken, get_shifts);

module.exports = router;