import { db } from '../config/db.js';
import { user, farmer_profile, farms, cultivation, harvest, main } from '../src/db/schema.js';
import { eq, and, sql, desc } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { validationResult } from 'express-validator';
import { generateToken } from '../utils/jwt.js';
import { uploadToGoogleDrive } from '../utils/googleDrive.js';
import { BlockchainHelper } from '../blockchain/BlockchainHelper.js';


const sanitizeUser = (userInstance) => {
    const { password_hash, ...userWithoutPassword } = userInstance;
    return userWithoutPassword;
};

export const registerFarmer = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            errors: errors.array() 
        });
    }

    const { name, email, password, phone, nic, address, gender, date_of_birth } = req.body;

    try {
        // Check if user already exists before starting transaction
        const userExists = await db.select().from(user).where(eq(user.email, email));
        if (userExists.length > 0) {
            return res.status(400).json({ 
                success: false,
                message: 'User already exists' 
            });
        }

        const result = await db.transaction(async (tx) => {
            const salt = await bcrypt.genSalt(10);
            const password_hash = await bcrypt.hash(password, salt);

            const newUser = await tx.insert(user).values({
                name,
                email,
                password_hash,
                phone,
                role_id: 1, // farmer role
                status: 'active'
            }).returning();

            await tx.insert(farmer_profile).values({
                user_id: newUser[0].user_id,
                nic,
                address,
                gender,
                date_of_birth
            });

            return newUser[0];
        });

        const sanitizedUser = sanitizeUser(result);
        
        res.status(201).json({
            success: true,
            message: 'Farmer registered successfully',
            user: sanitizedUser,
            token: generateToken(result.user_id)
        });
    } catch (error) {
        console.error("Error registering farmer:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to register farmer", 
            error: error.message 
        });
    }
};

export const loginFarmer = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            errors: errors.array() 
        });
    }

    const { email, password } = req.body;

    try {
        const users = await db.select().from(user).where(eq(user.email, email));
        if (users.length === 0) {
            return res.status(401).json({ 
                success: false,
                message: 'Invalid credentials' 
            });
        }

        const userInstance = users[0];

        if (userInstance.role_id !== 1) {
            return res.status(403).json({ 
                success: false,
                message: 'Not authorized as a farmer' 
            });
        }

        const isMatch = await bcrypt.compare(password, userInstance.password_hash);

        if (!isMatch) {
            return res.status(401).json({ 
                success: false,
                message: 'Invalid credentials' 
            });
        }

        const sanitizedUser = sanitizeUser(userInstance);
        
        res.json({
            success: true,
            message: 'Login successful',
            user: sanitizedUser,
            token: generateToken(userInstance.user_id),
        });
    } catch (error) {
        console.error("Error logging in farmer:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to login farmer", 
            error: error.message 
        });
    }
};

export const createFarm = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            errors: errors.array() 
        });
    }

    try {
        // Verify user is a farmer (handle both string and number types). Needed when debugging.
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 1) {
            console.error('Role check failed:', {
                role_id: req.user.role_id,
                type: typeof req.user.role_id,
                converted: userRoleId,
                user_id: req.user.user_id
            });
            return res.status(403).json({ 
                success: false,
                message: 'Only farmers can create farms. Please ensure you logged in as a farmer.'
            });
        }

        // Get farmer_id from farmer_profile using user_id
        const farmerProfiles = await db.select()
            .from(farmer_profile)
            .where(eq(farmer_profile.user_id, req.user.user_id));

        if (farmerProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Farmer profile not found' 
            });
        }

        const farmerId = farmerProfiles[0].farmer_id;
        const { farm_name, gps_coordinates, area_acres } = req.body;

        // Create farm record
        // Note: created_at and updated_at are handled by database defaults
        const newFarm = await db.insert(farms).values({
            farmer_id: farmerId,
            farm_name,
            gps_coordinates,
            area_acres: parseFloat(area_acres)
        }).returning();

        res.status(201).json({
            success: true,
            message: 'Farm created successfully',
            farm: newFarm[0]
        });
    } catch (error) {
        console.error("Error creating farm:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to create farm", 
            error: error.message 
        });
    }
};

export const getFarms = async (req, res) => {
    try {
        // Verify user is a farmer
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 1) {
            return res.status(403).json({ 
                success: false,
                message: 'Only farmers can view farms'
            });
        }

        // Get farmer_id from farmer_profile
        const farmerProfiles = await db.select()
            .from(farmer_profile)
            .where(eq(farmer_profile.user_id, req.user.user_id));

        if (farmerProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Farmer profile not found' 
            });
        }

        const farmerId = farmerProfiles[0].farmer_id;

        // Get all farms for this farmer
        const farmerFarms = await db.select()
            .from(farms)
            .where(eq(farms.farmer_id, farmerId));

        res.json({
            success: true,
            farms: farmerFarms
        });
    } catch (error) {
        console.error("Error fetching farms:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to fetch farms", 
            error: error.message 
        });
    }
};

export const createCultivation = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            errors: errors.array() 
        });
    }

    try {
        // Verify user is a farmer (handle both string and number types).
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 1) {
            console.error('Role check failed:', {
                role_id: req.user.role_id,
                type: typeof req.user.role_id,
                converted: userRoleId,
                user_id: req.user.user_id
            });
            return res.status(403).json({ 
                success: false,
                message: 'Only farmers can create cultivation records. Please ensure you logged in as a farmer.'
            });
        }

        const farmerProfiles = await db.select()
            .from(farmer_profile)
            .where(eq(farmer_profile.user_id, req.user.user_id));

        if (farmerProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Farmer profile not found' 
            });
        }

        const farmerId = farmerProfiles[0].farmer_id;
        const { batch_no, farm_id, date_of_planting, seeding_source, type_of_fertilizers, pesticides, expected_harvest_date, no_of_trees } = req.body;

        // Verify that the farm belongs to this farmer
        const farmRecords = await db.select()
            .from(farms)
            .where(and(
                eq(farms.farm_id, parseInt(farm_id)),
                eq(farms.farmer_id, farmerId)
            ));

        if (farmRecords.length === 0) {
            return res.status(403).json({ 
                success: false,
                message: 'Farm not found or you do not have permission to create cultivation for this farm' 
            });
        }

        // Check if batch_no already exists
        const existingBatch = await db.select()
            .from(main)
            .where(eq(main.batch_no, batch_no));

        if (existingBatch.length > 0) {
            return res.status(400).json({ 
                success: false,
                message: 'Batch number already exists' 
            });
        }

        // Upload file to Google Drive with unique filename using batch_no 
        let driveFileData = null;
        if (req.file) {
            try {
                const customFileName = `organic-cert-${batch_no}`;
                driveFileData = await uploadToGoogleDrive(req.file, 'Organic Certification', customFileName);
            } catch (uploadError) {
                console.error('Error uploading file to Google Drive:', uploadError);
                return res.status(500).json({ 
                    success: false,
                    message: 'Failed to upload organic certification document to Google Drive',
                    error: uploadError.message
                });
            }
        }

        const result = await db.transaction(async (tx) => {
            // create main record first with batch_no, farm_id, farmer_id, is_harvested=false
            await tx.insert(main).values({
                batch_no: batch_no,
                farm_id: farm_id,
                farmer_id: farmerId,
                is_harvested: false
            });

            // create cultivation record referencing batch_no
            const newCultivation = await tx.insert(cultivation).values({
                batch_no: batch_no,
                date_of_planting,
                seeding_source,
                type_of_fertilizers,
                pesticides,
                organic_certification: driveFileData ? driveFileData.webViewLink : null, // google drive link only
                expected_harvest_date,
                no_of_trees: no_of_trees
            }).returning();

            // update main table with cultivation_id
            await tx.update(main)
                .set({ 
                    cultivation_id: newCultivation[0].cultivation_id,
                    updated_at: sql`NOW()`
                })
                .where(eq(main.batch_no, batch_no));

            return newCultivation[0];
        });

        // writ cultivation on blockchain
        const blockchainResult = await BlockchainHelper.recordCultivation(
            {
                farm_id: farm_id,
                date_of_planting: date_of_planting,
                seeding_source: seeding_source,
                type_of_fertilizers: type_of_fertilizers,
                pesticides: pesticides,
                organic_certification: driveFileData ? driveFileData.webViewLink : null,
                expected_harvest_date: expected_harvest_date,
                no_of_trees: no_of_trees
            },
            batch_no,
            req.user.user_id,
            farmerId
        );

        const response = {
            success: true,
            message: 'Cultivation record created successfully',
            cultivation: result,
            batch_no: batch_no,
            blockchain: blockchainResult
        };

        // Include organic certification link only if provided
        if (driveFileData) {
            response.organic_certification_link = driveFileData.webViewLink;
        }

        res.status(201).json(response);
    } catch (error) {
        console.error("Error creating cultivation:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to create cultivation record", 
            error: error.message 
        });
    }
};

export const getCultivations = async (req, res) => {
    try {
        // Verify user is a farmer
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 1) {
            return res.status(403).json({ 
                success: false,
                message: 'Only farmers can view cultivations'
            });
        }

        // Get farmer_id from farmer_profile
        const farmerProfiles = await db.select()
            .from(farmer_profile)
            .where(eq(farmer_profile.user_id, req.user.user_id));

        if (farmerProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Farmer profile not found' 
            });
        }

        const farmerId = farmerProfiles[0].farmer_id;

        // Get all farms for this farmer first
        const farmerFarms = await db.select()
            .from(farms)
            .where(eq(farms.farmer_id, farmerId));

        const farmIds = farmerFarms.map(f => f.farm_id);

        if (farmIds.length === 0) {
            return res.json({
                success: true,
                cultivations: []
            });
        }

        // Get all cultivations from main table where farm_id belongs to this farmer
        const cultivationRecords = await db.select({
            batch_no: main.batch_no,
            farm_id: main.farm_id,
            cultivation_id: cultivation.cultivation_id,
            date_of_planting: cultivation.date_of_planting,
            seeding_source: cultivation.seeding_source,
            type_of_fertilizers: cultivation.type_of_fertilizers,
            pesticides: cultivation.pesticides,
            organic_certification: cultivation.organic_certification,
            expected_harvest_date: cultivation.expected_harvest_date,
            no_of_trees: cultivation.no_of_trees,
            is_harvested: main.is_harvested,
            harvested_quantity: main.harvested_quantity,
            harvest_date: harvest.harvest_date,
            created_at: cultivation.created_at,
            farm_name: farms.farm_name
        })
        .from(main)
        .innerJoin(cultivation, eq(main.batch_no, cultivation.batch_no))
        .innerJoin(farms, eq(main.farm_id, farms.farm_id))
        .leftJoin(harvest, eq(main.batch_no, harvest.batch_no))
        .where(eq(main.farmer_id, farmerId))
        .orderBy(desc(cultivation.date_of_planting), desc(cultivation.created_at));

        res.json({
            success: true,
            cultivations: cultivationRecords
        });
    } catch (error) {
        console.error("Error fetching cultivations:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to fetch cultivations", 
            error: error.message 
        });
    }
};

export const getCultivationByBatchNo = async (req, res) => {
    try {
        const { batch_no } = req.params;
        
        // Verify user is a farmer
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 1) {
            return res.status(403).json({ 
                success: false,
                message: 'Only farmers can view cultivation details'
            });
        }

        // Get farmer_id from farmer_profile
        const farmerProfiles = await db.select()
            .from(farmer_profile)
            .where(eq(farmer_profile.user_id, req.user.user_id));

        if (farmerProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Farmer profile not found' 
            });
        }

        const farmerId = farmerProfiles[0].farmer_id;

        // Get cultivation details with farm info
        const cultivationRecord = await db.select({
            batch_no: main.batch_no,
            farm_id: main.farm_id,
            cultivation_id: cultivation.cultivation_id,
            date_of_planting: cultivation.date_of_planting,
            seeding_source: cultivation.seeding_source,
            type_of_fertilizers: cultivation.type_of_fertilizers,
            pesticides: cultivation.pesticides,
            organic_certification: cultivation.organic_certification,
            expected_harvest_date: cultivation.expected_harvest_date,
            no_of_trees: cultivation.no_of_trees,
            is_harvested: main.is_harvested,
            harvested_quantity: main.harvested_quantity,
            harvest_date: harvest.harvest_date,
            harvest_method: harvest.harvest_method,
            created_at: cultivation.created_at,
            farm_name: farms.farm_name,
            gps_coordinates: farms.gps_coordinates,
            area_acres: farms.area_acres
        })
        .from(main)
        .innerJoin(cultivation, eq(main.batch_no, cultivation.batch_no))
        .innerJoin(farms, eq(main.farm_id, farms.farm_id))
        .leftJoin(harvest, eq(main.batch_no, harvest.batch_no))
        .where(and(
            eq(main.batch_no, batch_no),
            eq(main.farmer_id, farmerId)
        ));

        if (cultivationRecord.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Cultivation not found or you do not have permission to view it' 
            });
        }

        res.json({
            success: true,
            cultivation: cultivationRecord[0]
        });
    } catch (error) {
        console.error("Error fetching cultivation details:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to fetch cultivation details", 
            error: error.message 
        });
    }
};

export const createHarvest = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            errors: errors.array() 
        });
    }

    try {
        // Verify user is a farmer (handle both string and number types).
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 1) {
            console.error('Role check failed:', {
                role_id: req.user.role_id,
                type: typeof req.user.role_id,
                converted: userRoleId,
                user_id: req.user.user_id
            });
            return res.status(403).json({ 
                success: false,
                message: 'Only farmers can create harvest records. Please ensure you logged in as a farmer.'
            });
        }

        const farmerProfiles = await db.select()
            .from(farmer_profile)
            .where(eq(farmer_profile.user_id, req.user.user_id));

        if (farmerProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Farmer profile not found' 
            });
        }

        const farmerId = farmerProfiles[0].farmer_id;
        const { batch_no, harvest_date, harvest_method, quantity } = req.body;

        // Verify that the batch exists in main table and belongs to this farmer
        const batchRecords = await db.select()
            .from(main)
            .where(and(
                eq(main.batch_no, batch_no),
                eq(main.farmer_id, farmerId)
            ));

        if (batchRecords.length === 0) {
            return res.status(403).json({ 
                success: false,
                message: 'Batch not found or you do not have permission to create harvest for this batch' 
            });
        }

        // Check if already harvested
        if (batchRecords[0].is_harvested === true) {
            return res.status(400).json({ 
                success: false,
                message: 'This batch has already been harvested' 
            });
        }

        const result = await db.transaction(async (tx) => {
            // create harvest record
            const newHarvest = await tx.insert(harvest).values({
                batch_no: batch_no,
                harvest_date,
                harvest_method,
                quantity: parseFloat(quantity)
            }).returning();

            // update main table with harvest_id, is_harvested=true, and harvested_quantity
            await tx.update(main)
                .set({ 
                    harvest_id: newHarvest[0].harvest_id,
                    is_harvested: true,
                    harvested_quantity: parseFloat(quantity),
                    updated_at: sql`NOW()`
                })
                .where(eq(main.batch_no, batch_no));

            return newHarvest[0];
        });

        // write harvest on blockchain
        const blockchainResult = await BlockchainHelper.recordHarvest(
            {
                harvest_date: harvest_date,
                harvest_method: harvest_method,
                quantity: quantity,
                harvest_id: result.harvest_id
            },
            batch_no,
            req.user.user_id
        );

        res.status(201).json({
            success: true,
            message: 'Harvest record created successfully',
            harvest: result,
            batch_no: batch_no,
            blockchain: blockchainResult
        });
    } catch (error) {
        console.error("Error creating harvest:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to create harvest record", 
            error: error.message 
        });
    }
};

export const getFarmerProfile = async (req, res) => {
    try {
        // Verify user is a farmer (handle both string and number types). Needed when debugging.
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 1) {
            return res.status(403).json({ 
                success: false,
                message: 'Only farmers can access farmer profile' 
            });
        }

        // Get user information
        const users = await db.select()
            .from(user)
            .where(eq(user.user_id, req.user.user_id));

        if (users.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'User not found' 
            });
        }

        // Get farmer profile information
        const farmerProfiles = await db.select()
            .from(farmer_profile)
            .where(eq(farmer_profile.user_id, req.user.user_id));

        if (farmerProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Farmer profile not found' 
            });
        }

        // Combine user and farmer profile data
        const userData = sanitizeUser(users[0]);
        const farmerData = farmerProfiles[0];

        res.json({
            success: true,
            profile: {
                ...userData,
                farmer_profile: {
                    farmer_id: farmerData.farmer_id,
                    nic: farmerData.nic,
                    address: farmerData.address,
                    gender: farmerData.gender,
                    date_of_birth: farmerData.date_of_birth,
                    created_at: farmerData.created_at,
                    updated_at: farmerData.updated_at
                }
            }
        });
    } catch (error) {
        console.error("Error fetching farmer profile:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to fetch farmer profile", 
            error: error.message 
        });
    }
};
