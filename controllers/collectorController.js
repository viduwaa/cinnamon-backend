import { db } from '../config/db.js';
import { user, collector_profile, main, collect_table, transport, farms, farmer_profile, harvest, cultivation, processor_profile } from '../src/db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { validationResult } from 'express-validator';
import { generateToken } from '../utils/jwt.js';
import { BlockchainHelper } from '../blockchain/BlockchainHelper.js';

const sanitizeUser = (userInstance) => {
    const { password_hash, ...userWithoutPassword } = userInstance;
    return userWithoutPassword;
};

// Get all processors for selection during transport
export const getProcessors = async (req, res) => {
    try {
        // Verify user is a collector
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 2) {
            return res.status(403).json({ 
                success: false,
                message: 'Only collectors can fetch processors' 
            });
        }

        // Get all processors with their profile info
        const processors = await db.select({
            processor_id: processor_profile.processor_id,
            user_id: processor_profile.user_id,
            process_station_name: processor_profile.process_station_name,
            process_station_location: processor_profile.process_station_location,
            name: user.name,
            phone: user.phone
        })
        .from(processor_profile)
        .leftJoin(user, eq(processor_profile.user_id, user.user_id));

        res.json({
            success: true,
            processors: processors
        });
    } catch (error) {
        console.error("Error fetching processors:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to fetch processors", 
            error: error.message 
        });
    }
};

export const registerCollector = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            errors: errors.array() 
        });
    }

    const { name, email, password, phone, center_name, vehicle_id, location } = req.body;

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
                role_id: 2, // collector role
                status: 'active'
            }).returning();

            await tx.insert(collector_profile).values({
                user_id: newUser[0].user_id,
                center_name,
                vehicle_id,
                location
            });

            return newUser[0];
        });

        const sanitizedUser = sanitizeUser(result);
        
        res.status(201).json({
            success: true,
            message: 'Collector registered successfully',
            user: sanitizedUser,
            token: generateToken(result.user_id)
        });
    } catch (error) {
        console.error("Error registering collector:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to register collector", 
            error: error.message 
        });
    }
};

export const loginCollector = async (req, res) => {
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

        if (userInstance.role_id !== 2) {
            return res.status(403).json({ 
                success: false,
                message: 'Not authorized as a collector' 
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
        console.error("Error logging in collector:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to login collector", 
            error: error.message 
        });
    }
};

export const getCollectorProfile = async (req, res) => {
    try {
        // Verify user is a collector
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 2) {
            return res.status(403).json({ 
                success: false,
                message: 'Only collectors can access collector profile' 
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

        // Get collector profile information
        const collectorProfiles = await db.select()
            .from(collector_profile)
            .where(eq(collector_profile.user_id, req.user.user_id));

        if (collectorProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Collector profile not found' 
            });
        }

        // Combine user and collector profile data
        const userData = sanitizeUser(users[0]);
        const collectorData = collectorProfiles[0];

        res.json({
            success: true,
            profile: {
                ...userData,
                collector_profile: {
                    collector_id: collectorData.collector_id,
                    center_name: collectorData.center_name,
                    vehicle_id: collectorData.vehicle_id,
                    location: collectorData.location,
                    created_at: collectorData.created_at,
                    updated_at: collectorData.updated_at
                }
            }
        });
    } catch (error) {
        console.error("Error fetching collector profile:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to fetch collector profile", 
            error: error.message 
        });
    }
};

export const collectBatch = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            errors: errors.array() 
        });
    }

    try {
        // Verify user is a collector
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 2) {
            return res.status(403).json({ 
                success: false,
                message: 'Only collectors can collect batches' 
            });
        }

        // Get collector_id from collector_profile using user_id
        const collectorProfiles = await db.select()
            .from(collector_profile)
            .where(eq(collector_profile.user_id, req.user.user_id));

        if (collectorProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Collector profile not found' 
            });
        }

        const collectorId = collectorProfiles[0].collector_id;
        const { batch_no, collected_date } = req.body;

        // Verify that the batch exists and is harvested
        const batchRecords = await db.select()
            .from(main)
            .where(eq(main.batch_no, batch_no));

        if (batchRecords.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Batch not found' 
            });
        }

        const batch = batchRecords[0];

        // Check if batch is harvested
        if (!batch.is_harvested) {
            return res.status(400).json({ 
                success: false,
                message: 'Batch must be harvested before collection' 
            });
        }

        // Check if batch is already collected
        if (batch.is_collected) {
            return res.status(400).json({ 
                success: false,
                message: 'This batch has already been collected' 
            });
        }

        const result = await db.transaction(async (tx) => {
            // create collect_table record
            const newCollection = await tx.insert(collect_table).values({
                batch_no: batch_no,
                collector_id: collectorId,
                collected_date: collected_date
            }).returning();

            // update main table
            await tx.update(main)
                .set({ 
                    collect_id: newCollection[0].collect_id,
                    is_collected: true,
                    updated_at: sql`NOW()`
                })
                .where(eq(main.batch_no, batch_no));

            return newCollection[0];
        });

        // create collection on blockchain
        const blockchainResult = await BlockchainHelper.recordCollection(
            {
                collected_date: collected_date,
                collect_id: result.collect_id
            },
            batch_no,
            req.user.user_id,
            collectorId,
            batch.farmer_id
        );

        res.status(201).json({
            success: true,
            message: 'Batch collected successfully',
            collection: result,
            batch_no: batch_no,
            blockchain: blockchainResult
        });
    } catch (error) {
        console.error("Error collecting batch:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to collect batch", 
            error: error.message 
        });
    }
};

export const startTransport = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            errors: errors.array() 
        });
    }

    try {
        // Verify user is a collector
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 2) {
            return res.status(403).json({ 
                success: false,
                message: 'Only collectors can start transport' 
            });
        }

        // Get collector_id from collector_profile using user_id
        const collectorProfiles = await db.select()
            .from(collector_profile)
            .where(eq(collector_profile.user_id, req.user.user_id));

        if (collectorProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Collector profile not found' 
            });
        }

        const collectorId = collectorProfiles[0].collector_id;
        const { batch_no, transport_method, transport_started_date, storage_conditions, processor_id } = req.body;

        // Verify that the batch exists, is harvested, and is collected
        const batchRecords = await db.select()
            .from(main)
            .where(eq(main.batch_no, batch_no));

        if (batchRecords.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Batch not found' 
            });
        }

        const batch = batchRecords[0];

        // Check if batch is harvested
        if (!batch.is_harvested) {
            return res.status(400).json({ 
                success: false,
                message: 'Batch must be harvested before transport' 
            });
        }

        // Check if batch is collected
        if (!batch.is_collected) {
            return res.status(400).json({ 
                success: false,
                message: 'Batch must be collected before transport' 
            });
        }

        // Check if batch is already in transport
        if (batch.inTransporting) {
            return res.status(400).json({ 
                success: false,
                message: 'This batch is already in transport' 
            });
        }

        // Check if batch is already transported
        if (batch.isTransported) {
            return res.status(400).json({ 
                success: false,
                message: 'This batch has already been transported' 
            });
        }

        console.log('[DEBUG] Starting transport for batch:', batch_no);
        console.log('[DEBUG] req.body:', req.body);
        console.log('[DEBUG] collectorId:', collectorId);

        const result = await db.transaction(async (tx) => {
            // create transport record
            const newTransport = await tx.insert(transport).values({
                batch_no: batch_no,
                collector_id: collectorId,
                processor_id: processor_id || null,
                transport_method: transport_method,
                transport_started_date: transport_started_date,
                storage_conditions: storage_conditions
            }).returning();

            console.log('[DEBUG] Inserted transport record:', newTransport[0]);

            // update main table with transport info and optional processor_id
            const updateResult = await tx.update(main)
                .set({ 
                    transport_id: newTransport[0].transport_id,
                    inTransporting: true,
                    processor_id: processor_id || null,
                    updated_at: sql`NOW()`
                })
                .where(eq(main.batch_no, batch_no))
                .returning();

            console.log('[DEBUG] Updated main table record:', updateResult[0]);

            return newTransport[0];
        });

        // create transport start on blockchain
        const blockchainResult = await BlockchainHelper.recordTransportStart(
            {
                transport_method: transport_method,
                transport_started_date: transport_started_date,
                storage_conditions: storage_conditions,
                transport_id: result.transport_id
            },
            batch_no,
            req.user.user_id,
            collectorId
        );

        res.status(201).json({
            success: true,
            message: 'Transport started successfully',
            transport: result,
            batch_no: batch_no,
            blockchain: blockchainResult
        });
    } catch (error) {
        console.error("Error starting transport:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to start transport", 
            error: error.message 
        });
    }
};

export const completeTransport = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            errors: errors.array() 
        });
    }

    try {
        // Verify user is a collector
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 2) {
            return res.status(403).json({ 
                success: false,
                message: 'Only collectors can complete transport' 
            });
        }

        // Get collector_id from collector_profile using user_id
        const collectorProfiles = await db.select()
            .from(collector_profile)
            .where(eq(collector_profile.user_id, req.user.user_id));

        if (collectorProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Collector profile not found' 
            });
        }

        const collectorId = collectorProfiles[0].collector_id;
        const { batch_no, transport_ended_date } = req.body;

        // Verify that the batch exists and is in transport
        const batchRecords = await db.select()
            .from(main)
            .where(eq(main.batch_no, batch_no));

        if (batchRecords.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Batch not found' 
            });
        }

        const batch = batchRecords[0];

        // Check if batch is in transport
        if (!batch.inTransporting) {
            return res.status(400).json({ 
                success: false,
                message: 'This batch is not in transport' 
            });
        }

        // Check if batch is already transported
        if (batch.isTransported) {
            return res.status(400).json({ 
                success: false,
                message: 'This batch has already been transported' 
            });
        }

        // Verify that the transport belongs to this collector
        if (!batch.transport_id) {
            return res.status(400).json({ 
                success: false,
                message: 'Transport record not found for this batch' 
            });
        }

        const transportRecords = await db.select()
            .from(transport)
            .where(and(
                eq(transport.transport_id, batch.transport_id),
                eq(transport.collector_id, collectorId)
            ));

        if (transportRecords.length === 0) {
            return res.status(403).json({ 
                success: false,
                message: 'You do not have permission to complete this transport' 
            });
        }

        const result = await db.transaction(async (tx) => {
            // update transport record with ended date
            const updatedTransport = await tx.update(transport)
                .set({ 
                    transport_ended_date: transport_ended_date,
                    updated_at: sql`NOW()`
                })
                .where(eq(transport.transport_id, batch.transport_id))
                .returning();

            // update main table
            await tx.update(main)
                .set({ 
                    isTransported: true,
                    inTransporting: false,
                    updated_at: sql`NOW()`
                })
                .where(eq(main.batch_no, batch_no));

            return updatedTransport[0];
        });

        // write transport completion on blockchain
        const blockchainResult = await BlockchainHelper.recordTransportEnd(
            {
                transport_ended_date: transport_ended_date,
                transport_id: batch.transport_id
            },
            batch_no,
            req.user.user_id,
            collectorId
        );

        res.json({
            success: true,
            message: 'Transport completed successfully',
            transport: result,
            batch_no: batch_no,
            blockchain: blockchainResult
        });
    } catch (error) {
        console.error("Error completing transport:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to complete transport", 
            error: error.message 
        });
    }
};

export const getAvailableBatches = async (req, res) => {
    try {
        // Verify user is a collector
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 2) {
            return res.status(403).json({ 
                success: false,
                message: 'Only collectors can access available batches' 
            });
        }

        // Get batches that are harvested but not yet collected
        // Join with farms and farmer_profile to get additional context
        const availableBatches = await db
            .select({
                batch_no: main.batch_no,
                farm_id: main.farm_id,
                farmer_id: main.farmer_id,
                harvested_quantity: main.harvested_quantity,
                farm_name: farms.farm_name,
                gps_coordinates: farms.gps_coordinates,
                farmer_name: user.name,
                farmer_phone: user.phone,
                is_harvested: main.is_harvested,
                created_at: main.created_at
            })
            .from(main)
            .leftJoin(farms, eq(main.farm_id, farms.farm_id))
            .leftJoin(farmer_profile, eq(main.farmer_id, farmer_profile.farmer_id))
            .leftJoin(user, eq(farmer_profile.user_id, user.user_id))
            .where(
                and(
                    eq(main.is_harvested, true),
                    eq(main.is_collected, false)
                )
            )
            .orderBy(main.created_at);

        res.json({
            success: true,
            batches: availableBatches
        });
    } catch (error) {
        console.error("Error fetching available batches:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to fetch available batches", 
            error: error.message 
        });
    }
};

export const getMyCollections = async (req, res) => {
    try {
        // Verify user is a collector
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 2) {
            return res.status(403).json({ 
                success: false,
                message: 'Only collectors can access their collections' 
            });
        }

        // Get collector_id from collector_profile using user_id
        const collectorProfiles = await db.select()
            .from(collector_profile)
            .where(eq(collector_profile.user_id, req.user.user_id));

        if (collectorProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Collector profile not found' 
            });
        }

        const collectorId = collectorProfiles[0].collector_id;

        // Get all batches collected by this collector with transport status
        const myCollections = await db
            .select({
                collect_id: collect_table.collect_id,
                batch_no: collect_table.batch_no,
                collected_date: collect_table.collected_date,
                farm_id: main.farm_id,
                farmer_id: main.farmer_id,
                harvested_quantity: main.harvested_quantity,
                is_collected: main.is_collected,
                inTransporting: main.inTransporting,
                isTransported: main.isTransported,
                farm_name: farms.farm_name,
                gps_coordinates: farms.gps_coordinates,
                farmer_name: user.name,
                farmer_phone: user.phone,
                transport_id: transport.transport_id,
                transport_method: transport.transport_method,
                transport_started_date: transport.transport_started_date,
                transport_ended_date: transport.transport_ended_date,
                storage_conditions: transport.storage_conditions
            })
            .from(collect_table)
            .innerJoin(main, eq(collect_table.batch_no, main.batch_no))
            .leftJoin(farms, eq(main.farm_id, farms.farm_id))
            .leftJoin(farmer_profile, eq(main.farmer_id, farmer_profile.farmer_id))
            .leftJoin(user, eq(farmer_profile.user_id, user.user_id))
            .leftJoin(transport, eq(main.transport_id, transport.transport_id))
            .where(eq(collect_table.collector_id, collectorId))
            .orderBy(sql`${collect_table.collected_date} DESC`);

        // Transform data to include transport status
        const collectionsWithStatus = myCollections.map(item => ({
            ...item,
            transport_status: item.isTransported 
                ? 'completed' 
                : item.inTransporting 
                    ? 'in_progress' 
                    : 'pending'
        }));

        res.json({
            success: true,
            collections: collectionsWithStatus
        });
    } catch (error) {
        console.error("Error fetching collections:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to fetch collections", 
            error: error.message 
        });
    }
};

export const getTransportReadyBatches = async (req, res) => {
    try {
        // Verify user is a collector
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 2) {
            return res.status(403).json({ 
                success: false,
                message: 'Only collectors can access transport-ready batches' 
            });
        }

        // Get collector_id from collector_profile using user_id
        const collectorProfiles = await db.select()
            .from(collector_profile)
            .where(eq(collector_profile.user_id, req.user.user_id));

        if (collectorProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Collector profile not found' 
            });
        }

        const collectorId = collectorProfiles[0].collector_id;
        const collectorVehicleId = collectorProfiles[0].vehicle_id;

        // Get batches that are collected by this collector but not yet in transport or transported
        const transportReadyBatches = await db
            .select({
                batch_no: collect_table.batch_no,
                collected_date: collect_table.collected_date,
                farm_id: main.farm_id,
                farmer_id: main.farmer_id,
                harvested_quantity: main.harvested_quantity,
                farm_name: farms.farm_name,
                farmer_name: user.name,
                is_collected: main.is_collected,
                inTransporting: main.inTransporting,
                isTransported: main.isTransported
            })
            .from(collect_table)
            .innerJoin(main, eq(collect_table.batch_no, main.batch_no))
            .leftJoin(farms, eq(main.farm_id, farms.farm_id))
            .leftJoin(farmer_profile, eq(main.farmer_id, farmer_profile.farmer_id))
            .leftJoin(user, eq(farmer_profile.user_id, user.user_id))
            .where(
                and(
                    eq(collect_table.collector_id, collectorId),
                    eq(main.is_collected, true),
                    eq(main.inTransporting, false),
                    eq(main.isTransported, false)
                )
            )
            .orderBy(sql`${collect_table.collected_date} DESC`);

        res.json({
            success: true,
            batches: transportReadyBatches,
            vehicle_id: collectorVehicleId
        });
    } catch (error) {
        console.error("Error fetching transport-ready batches:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to fetch transport-ready batches", 
            error: error.message 
        });
    }
};

export const getBatchDetails = async (req, res) => {
    try {
        // Verify user is a collector
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 2) {
            return res.status(403).json({ 
                success: false,
                message: 'Only collectors can access batch details' 
            });
        }

        const { batch_no } = req.params;

        if (!batch_no) {
            return res.status(400).json({ 
                success: false,
                message: 'Batch number is required' 
            });
        }

        // Get batch from main table with all related info
        const batchRecords = await db.select()
            .from(main)
            .where(eq(main.batch_no, batch_no));

        console.log('[DEBUG] getBatchDetails for', batch_no, 'Found batch record:', batchRecords[0]);

        if (batchRecords.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Batch not found' 
            });
        }

        const batch = batchRecords[0];

        // Get farm details
        let farmData = null;
        if (batch.farm_id) {
            const farmRecords = await db.select()
                .from(farms)
                .where(eq(farms.farm_id, batch.farm_id));
            if (farmRecords.length > 0) {
                farmData = farmRecords[0];
            }
        }

        // Get farmer details
        let farmerData = null;
        if (batch.farmer_id) {
            const farmerRecords = await db.select({
                farmer_id: farmer_profile.farmer_id,
                nic: farmer_profile.nic,
                address: farmer_profile.address,
                name: user.name,
                phone: user.phone,
                email: user.email
            })
            .from(farmer_profile)
            .leftJoin(user, eq(farmer_profile.user_id, user.user_id))
            .where(eq(farmer_profile.farmer_id, batch.farmer_id));
            if (farmerRecords.length > 0) {
                farmerData = farmerRecords[0];
            }
        }

        // Get harvest details
        let harvestData = null;
        if (batch.harvest_id) {
            const harvestRecords = await db.select()
                .from(harvest)
                .where(eq(harvest.harvest_id, batch.harvest_id));
            if (harvestRecords.length > 0) {
                harvestData = harvestRecords[0];
            }
        }

        // Get cultivation details
        let cultivationData = null;
        const cultivationRecords = await db.select()
            .from(cultivation)
            .where(eq(cultivation.batch_no, batch_no));
        if (cultivationRecords.length > 0) {
            cultivationData = cultivationRecords[0];
        }

        // Get collection details
        let collectionData = null;
        let collectorData = null;
        if (batch.collect_id) {
            const collectRecords = await db.select()
                .from(collect_table)
                .where(eq(collect_table.collect_id, batch.collect_id));
            if (collectRecords.length > 0) {
                collectionData = collectRecords[0];
                
                // Get collector info
                const collectorRecords = await db.select({
                    collector_id: collector_profile.collector_id,
                    center_name: collector_profile.center_name,
                    vehicle_id: collector_profile.vehicle_id,
                    location: collector_profile.location,
                    name: user.name,
                    phone: user.phone
                })
                .from(collector_profile)
                .leftJoin(user, eq(collector_profile.user_id, user.user_id))
                .where(eq(collector_profile.collector_id, collectionData.collector_id));
                if (collectorRecords.length > 0) {
                    collectorData = collectorRecords[0];
                }
            }
        }

        // Get transport details
        let transportData = null;
        if (batch.transport_id) {
            const transportRecords = await db.select()
                .from(transport)
                .where(eq(transport.transport_id, batch.transport_id));
            if (transportRecords.length > 0) {
                transportData = transportRecords[0];
            }
        }

        // Get process details
        let processData = null;
        if (batch.process_id) {
            const processRecords = await db.select()
                .from(process)
                .where(eq(process.process_id, batch.process_id));
            if (processRecords.length > 0) {
                processData = processRecords[0];
            }
        }

        res.json({
            success: true,
            batch: {
                batch_no: batch.batch_no,
                is_harvested: batch.is_harvested,
                harvested_quantity: batch.harvested_quantity,
                dried_weight: batch.dried_weight,
                is_collected: batch.is_collected,
                inTransporting: batch.inTransporting,
                isTransported: batch.isTransported,
                created_at: batch.created_at,
                updated_at: batch.updated_at
            },
            farm: farmData,
            farmer: farmerData,
            cultivation: cultivationData,
            harvest: harvestData,
            collection: collectionData,
            collector: collectorData,
            transport: transportData,
            process: processData
        });
    } catch (error) {
        console.error("Error fetching batch details:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to fetch batch details", 
            error: error.message 
        });
    }
};

