import express from 'express';
const router = express.Router();
import { 
    registerDistributor, 
    loginDistributor, 
    getDistributorProfile,
    getAllDistributors,
    getAllExporters,
    getAvailableBatches,
    getMyDistributions,
    getDistributionDetails,
    markAsCollectedByDistributor,
    markAsDistributed
} from '../controllers/distributorController.js';
import { protect } from '../middleware/auth.js';
import { check } from 'express-validator';

router.post('/register', [
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
    check('phone', 'Phone number is required').not().isEmpty()
], registerDistributor);

router.post('/login', [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password is required').exists()
], loginDistributor);

router.get('/profile', protect, getDistributorProfile);

router.get('/all', protect, getAllDistributors);

router.get('/exporters', protect, getAllExporters);

router.get('/batches/available', protect, getAvailableBatches);

router.get('/distributions', protect, getMyDistributions);

router.get('/distributions/:batch_no', protect, getDistributionDetails);

router.post('/collect', protect, [
    check('batch_no', 'Batch number is required').not().isEmpty(),
    check('batch_no', 'Batch number must be a valid string').isString(),
    check('collected_date', 'Collected date is required').not().isEmpty(),
    check('collected_date', 'Collected date must be a valid date').isISO8601()
], markAsCollectedByDistributor);

router.post('/distribute', protect, [
    check('batch_no', 'Batch number is required').not().isEmpty(),
    check('batch_no', 'Batch number must be a valid string').isString(),
    check('distributed_date', 'Distribute date is required').not().isEmpty(),
    check('distributed_date', 'Distribute date must be a valid date').isISO8601()
], markAsDistributed);

export default router;
