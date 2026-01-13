import express from 'express';
const router = express.Router();
import { 
    registerProcessor, 
    loginProcessor, 
    getProcessorProfile,
    createGraderProfile,
    getGraders,
    getAvailableBatches,
    getDeliveringBatches,
    receiveBatch,
    getGradedBatches,
    getMyProcessings,
    getProcessingDetails,
    markAsInProcess,
    startDrying,
    markAsDried,
    markAsGraded,
    markAsPacked,
    markAsProcessed
} from '../controllers/processorController.js';
import { protect } from '../middleware/auth.js';
import { check } from 'express-validator';
import upload from '../middleware/upload.js';

router.post('/register', [
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
    check('phone', 'Phone number is required').not().isEmpty(),
    check('process_station_name', 'Process station name is required').not().isEmpty(),
    check('process_station_location', 'Process station location is required').not().isEmpty()
], registerProcessor);

router.post('/login', [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password is required').exists()
], loginProcessor);

router.get('/profile', protect, getProcessorProfile);

router.post('/graders', protect, [
    check('grader_name', 'Grader name is required').not().isEmpty(),
    check('grader_contact', 'Grader contact is required').not().isEmpty()
], createGraderProfile);

router.get('/graders', protect, getGraders);

router.get('/batches/available', protect, getAvailableBatches);

// Get batches currently being delivered (in transit)
router.get('/batches/delivering', protect, getDeliveringBatches);

router.post('/receive', protect, [
    check('batch_no', 'Batch number is required').not().isEmpty(),
    check('batch_no', 'Batch number must be a valid string').isString()
], receiveBatch);

// Get batches that are graded but not yet packed (ready for packaging)
router.get('/batches/graded', protect, getGradedBatches);

router.post('/process/start', protect, [
    check('batch_no', 'Batch number is required').not().isEmpty(),
    check('batch_no', 'Batch number must be a valid string').isString()
], markAsInProcess);

router.post('/process/dry/start', protect, [
    check('batch_no', 'Batch number is required').not().isEmpty(),
    check('batch_no', 'Batch number must be a valid string').isString(),
    check('dry_started_date', 'Dry started date is required').not().isEmpty(),
    check('dry_started_date', 'Dry started date must be a valid date').isISO8601()
], startDrying);

router.post('/process/dry', protect, [
    check('batch_no', 'Batch number is required').not().isEmpty(),
    check('batch_no', 'Batch number must be a valid string').isString(),
    check('dry_started_date', 'Dry started date is required').not().isEmpty(),
    check('dry_started_date', 'Dry started date must be a valid date').isISO8601(),
    check('dry_ended_date', 'Dry ended date is required').not().isEmpty(),
    check('dry_ended_date', 'Dry ended date must be a valid date').isISO8601(),
    check('moisture_content', 'Moisture content is required').not().isEmpty(),
    check('moisture_content', 'Moisture content must be a valid number').isFloat({ min: 0 }),
    check('dried_weight', 'Dried weight is required').not().isEmpty(),
    check('dried_weight', 'Dried weight must be a valid number').isFloat({ min: 0 })
], markAsDried);

router.post('/process/grade', protect, upload.single('grader_sign'), [
    check('batch_no', 'Batch number is required').not().isEmpty(),
    check('batch_no', 'Batch number must be a valid string').isString(),
    check('graded_date', 'Graded date is required').not().isEmpty(),
    check('graded_date', 'Graded date must be a valid date').isISO8601()
], markAsGraded);

router.post('/process/pack', protect, [
    check('batch_no', 'Batch number is required').not().isEmpty(),
    check('batch_no', 'Batch number must be a valid string').isString(),
    check('packed_date', 'Packed date is required').not().isEmpty(),
    check('packed_date', 'Packed date must be a valid date').isISO8601(),
    check('packed_by', 'Packed by is required').not().isEmpty(),
    check('packing_type', 'Packing type is required').not().isEmpty(),
    check('package_weight', 'Package weight is required').not().isEmpty(),
    check('package_weight', 'Package weight must be a valid number').isFloat({ min: 0 })
], markAsPacked);

router.post('/process/complete', protect, [
    check('batch_no', 'Batch number is required').not().isEmpty(),
    check('batch_no', 'Batch number must be a valid string').isString()
], markAsProcessed);

// Get all processings by this processor with status
router.get('/processings', protect, getMyProcessings);

// Get full processing details (chain view)
router.get('/processings/:batch_no', protect, getProcessingDetails);

export default router;