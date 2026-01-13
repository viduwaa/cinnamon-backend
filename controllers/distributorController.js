import { db } from '../config/db.js';
import { user, distributor_profile, main, distribute_table, farms, farmer_profile, cultivation, harvest, collect_table, collector_profile, transport, process, exporter_profile } from '../src/db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { validationResult } from 'express-validator';
import { generateToken } from '../utils/jwt.js';
import { BlockchainHelper } from '../blockchain/BlockchainHelper.js';

const sanitizeUser = (userInstance) => {
    const { password_hash, ...userWithoutPassword } = userInstance;
    return userWithoutPassword;
};

export const registerDistributor = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            errors: errors.array() 
        });
    }

    const { name, email, password, phone } = req.body;

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
                role_id: 4, // distributor role
                status: 'active'
            }).returning();

            await tx.insert(distributor_profile).values({
                user_id: newUser[0].user_id
            });

            return newUser[0];
        });

        const sanitizedUser = sanitizeUser(result);
        
        res.status(201).json({
            success: true,
            message: 'Distributor registered successfully',
            user: sanitizedUser,
            token: generateToken(result.user_id)
        });
    } catch (error) {
        console.error("Error registering distributor:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to register distributor", 
            error: error.message 
        });
    }
};

export const loginDistributor = async (req, res) => {
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

        if (userInstance.role_id !== 4) {
            return res.status(403).json({ 
                success: false,
                message: 'Not authorized as a distributor' 
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
        console.error("Error logging in distributor:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to login distributor", 
            error: error.message 
        });
    }
};

export const getDistributorProfile = async (req, res) => {
    try {
        // Verify user is a distributor
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 4) {
            return res.status(403).json({ 
                success: false,
                message: 'Only distributors can access distributor profile' 
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

        // Get distributor profile information
        const distributorProfiles = await db.select()
            .from(distributor_profile)
            .where(eq(distributor_profile.user_id, req.user.user_id));

        if (distributorProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Distributor profile not found' 
            });
        }

        // Combine user and distributor profile data
        const userData = sanitizeUser(users[0]);
        const distributorData = distributorProfiles[0];

        res.json({
            success: true,
            profile: {
                ...userData,
                distributor_profile: {
                    distributor_id: distributorData.distributor_id,
                    created_at: distributorData.created_at,
                    updated_at: distributorData.updated_at
                }
            }
        });
    } catch (error) {
        console.error("Error fetching distributor profile:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to fetch distributor profile", 
            error: error.message 
        });
    }
};

// Get all distributors (for transporter selection)
export const getAllDistributors = async (req, res) => {
    try {
        // Get all distributors with their user info
        const distributors = await db.select({
            distributor_id: distributor_profile.distributor_id,
            user_id: distributor_profile.user_id,
            name: user.name,
            phone: user.phone,
            email: user.email
        })
            .from(distributor_profile)
            .leftJoin(user, eq(distributor_profile.user_id, user.user_id))
            .where(eq(user.status, 'active'));

        res.json({
            success: true,
            distributors: distributors
        });
    } catch (error) {
        console.error("Error fetching distributors:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to fetch distributors", 
            error: error.message 
        });
    }
};

// Get available processed batches
export const getAvailableBatches = async (req, res) => {
    try {
        // Verify user is a distributor
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 4) {
            return res.status(403).json({ 
                success: false,
                message: 'Only distributors can view available batches' 
            });
        }

        // Get batches that are processed but not yet collected by distributor
        const availableBatches = await db.select()
            .from(main)
            .where(and(
                eq(main.isProcessed, true),
                eq(main.collected_by_distributor, false),
                eq(main.collected_by_exporter, false),
                eq(main.is_exported, false)
            ));

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

// Get all exporters for distribution assignment
export const getAllExporters = async (req, res) => {
    try {
        const userRoleId = Number(req.user.role_id);
        
        // Allow distributors and maybe processors? Just distributors for now based on context
        if (isNaN(userRoleId) || userRoleId !== 4) {
            return res.status(403).json({ 
                success: false,
                message: 'Only distributors can view exporters list' 
            });
        }

        const exporters = await db.select({
            exporter_id: exporter_profile.exporter_id,
            name: user.name,
            email: user.email,
            phone: user.phone
        })
        .from(exporter_profile)
        .leftJoin(user, eq(exporter_profile.user_id, user.user_id))
        .where(eq(user.status, 'active'));

        res.json({
            success: true,
            exporters
        });
    } catch (error) {
        console.error("Error fetching exporters:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to fetch exporters", 
            error: error.message 
        });
    }
};

// Get distributor's collected batches (my distributions)
export const getMyDistributions = async (req, res) => {
    try {
        // Verify user is a distributor
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 4) {
            return res.status(403).json({ 
                success: false,
                message: 'Only distributors can view their distributions' 
            });
        }

        // Get distributor_id from distributor_profile using user_id
        const distributorProfiles = await db.select()
            .from(distributor_profile)
            .where(eq(distributor_profile.user_id, req.user.user_id));

        if (distributorProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Distributor profile not found' 
            });
        }

        const distributorId = distributorProfiles[0].distributor_id;

        // Get all distributions for this distributor with batch info
        const distributions = await db.select({
            distribute_id: distribute_table.distribute_id,
            batch_no: distribute_table.batch_no,
            collected_date: distribute_table.collected_date,
            distributed_date: distribute_table.distributed_date,
            created_at: distribute_table.created_at,
            // Main table info
            harvested_quantity: main.harvested_quantity,
            dried_weight: main.dried_weight,
            is_distributed: main.is_distributed
        })
            .from(distribute_table)
            .leftJoin(main, eq(distribute_table.batch_no, main.batch_no))
            .where(eq(distribute_table.distributor_id, distributorId))
            .orderBy(sql`${distribute_table.created_at} DESC`);

        // Transform to include status
        const distributionsWithStatus = distributions.map(d => ({
            ...d,
            status: d.is_distributed ? 'distributed' : 'collected'
        }));

        res.json({
            success: true,
            distributions: distributionsWithStatus
        });
    } catch (error) {
        console.error("Error fetching distributor's distributions:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to fetch distributions", 
            error: error.message 
        });
    }
};

// Get distribution details with batch chain history
export const getDistributionDetails = async (req, res) => {
    try {
        const { batch_no } = req.params;
        
        // Verify user is a distributor
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 4) {
            return res.status(403).json({ 
                success: false,
                message: 'Only distributors can view distribution details' 
            });
        }

        // Get distributor_id from distributor_profile
        const distributorProfiles = await db.select()
            .from(distributor_profile)
            .where(eq(distributor_profile.user_id, req.user.user_id));

        if (distributorProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Distributor profile not found' 
            });
        }

        const distributorId = distributorProfiles[0].distributor_id;

        // Get distribution record
        const distributeRecords = await db.select()
            .from(distribute_table)
            .where(and(
                eq(distribute_table.batch_no, batch_no),
                eq(distribute_table.distributor_id, distributorId)
            ));

        if (distributeRecords.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Distribution not found or you do not have access to this batch' 
            });
        }

        const distribution = distributeRecords[0];

        // Get batch info from main table
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

        // Get farm info
        let farmData = null;
        if (batch.farm_id) {
            const farmRecords = await db.select().from(farms).where(eq(farms.farm_id, batch.farm_id));
            if (farmRecords.length > 0) {
                farmData = farmRecords[0];
            }
        }

        // Get farmer info
        let farmerData = null;
        if (batch.farmer_id) {
            const farmerRecords = await db.select({
                farmer_id: farmer_profile.farmer_id,
                user_id: farmer_profile.user_id,
                name: user.name,
                phone: user.phone
            })
            .from(farmer_profile)
            .leftJoin(user, eq(farmer_profile.user_id, user.user_id))
            .where(eq(farmer_profile.farmer_id, batch.farmer_id));
            
            if (farmerRecords.length > 0) {
                farmerData = farmerRecords[0];
            }
        }

        // Get cultivation info
        let cultivationData = null;
        if (batch.cultivation_id) {
            const cultivationRecords = await db.select().from(cultivation).where(eq(cultivation.cultivation_id, batch.cultivation_id));
            if (cultivationRecords.length > 0) {
                cultivationData = cultivationRecords[0];
            }
        }

        // Get harvest info
        let harvestData = null;
        if (batch.harvest_id) {
            const harvestRecords = await db.select().from(harvest).where(eq(harvest.harvest_id, batch.harvest_id));
            if (harvestRecords.length > 0) {
                harvestData = harvestRecords[0];
            }
        }

        // Get collection info
        let collectionData = null;
        let collectorData = null;
        if (batch.collection_id) {
            const collectionRecords = await db.select().from(collect_table).where(eq(collect_table.collection_id, batch.collection_id));
            if (collectionRecords.length > 0) {
                collectionData = collectionRecords[0];
                
                // Get collector info
                if (collectionData.collector_id) {
                    const collectorRecords = await db.select({
                        collector_id: collector_profile.collector_id,
                        user_id: collector_profile.user_id,
                        name: user.name
                    })
                    .from(collector_profile)
                    .leftJoin(user, eq(collector_profile.user_id, user.user_id))
                    .where(eq(collector_profile.collector_id, collectionData.collector_id));
                    
                    if (collectorRecords.length > 0) {
                        collectorData = collectorRecords[0];
                    }
                }
            }
        }

        // Get transport info
        let transportData = null;
        if (batch.transport_id) {
            const transportRecords = await db.select().from(transport).where(eq(transport.transport_id, batch.transport_id));
            if (transportRecords.length > 0) {
                transportData = transportRecords[0];
            }
        }

        // Get process info
        let processData = null;
        if (batch.process_id) {
            const processRecords = await db.select().from(process).where(eq(process.process_id, batch.process_id));
            if (processRecords.length > 0) {
                processData = processRecords[0];
            }
        }

        res.json({
            success: true,
            batch: {
                batch_no: batch.batch_no,
                harvested_quantity: batch.harvested_quantity,
                dried_weight: batch.dried_weight,
                isProcessed: batch.isProcessed,
                is_distributed: batch.is_distributed,
                created_at: batch.created_at
            },
            farm: farmData,
            farmer: farmerData,
            cultivation: cultivationData,
            harvest: harvestData,
            collection: collectionData,
            collector: collectorData,
            transport: transportData,
            process: processData,
            distribution: {
                distribute_id: distribution.distribute_id,
                collected_date: distribution.collected_date,
                distributed_date: distribution.distributed_date,
                created_at: distribution.created_at
            }
        });
    } catch (error) {
        console.error("Error fetching distribution details:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to fetch distribution details", 
            error: error.message 
        });
    }
};

// Mark as collected by distributor
export const markAsCollectedByDistributor = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            errors: errors.array() 
        });
    }

    try {
        // Verify user is a distributor
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 4) {
            return res.status(403).json({ 
                success: false,
                message: 'Only distributors can collect batches' 
            });
        }

        // Get distributor_id from distributor_profile using user_id
        const distributorProfiles = await db.select()
            .from(distributor_profile)
            .where(eq(distributor_profile.user_id, req.user.user_id));

        if (distributorProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Distributor profile not found' 
            });
        }

        const distributorId = distributorProfiles[0].distributor_id;
        const { batch_no, collected_date } = req.body;

        // Verify that the batch exists and is processed
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

        // Check if batch is processed
        if (!batch.isProcessed) {
            return res.status(400).json({ 
                success: false,
                message: 'Batch must be processed before collection by distributor' 
            });
        }

        // Check if batch is already collected by distributor
        if (batch.collected_by_distributor) {
            return res.status(400).json({ 
                success: false,
                message: 'This batch has already been collected by distributor' 
            });
        }

        const result = await db.transaction(async (tx) => {
            // create distribute_table record
            const newDistribute = await tx.insert(distribute_table).values({
                batch_no: batch_no,
                distributor_id: distributorId,
                collected_date: collected_date
            }).returning();

            // update main table
            await tx.update(main)
                .set({ 
                    collected_by_distributor: true,
                    distribute_id: newDistribute[0].distribute_id,
                    updated_at: sql`NOW()`
                })
                .where(eq(main.batch_no, batch_no));

            return newDistribute[0];
        });

        // create distribution collection on blockchain
        const blockchainResult = await BlockchainHelper.recordDistributionCollect(
            {
                collected_date: collected_date,
                distribute_id: result.distribute_id
            },
            batch_no,
            req.user.user_id,
            distributorId,
            batch.processor_id
        );

        res.status(201).json({
            success: true,
            message: 'Batch marked as collected by distributor successfully',
            distribution: result,
            batch_no: batch_no,
            blockchain: blockchainResult
        });
    } catch (error) {
        console.error("Error marking batch as collected by distributor:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to mark batch as collected by distributor", 
            error: error.message 
        });
    }
};

// Mark as distributed
export const markAsDistributed = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            errors: errors.array() 
        });
    }

    try {
        // Verify user is a distributor
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 4) {
            return res.status(403).json({ 
                success: false,
                message: 'Only distributors can mark batches as distributed' 
            });
        }

        // Get distributor_id from distributor_profile using user_id
        const distributorProfiles = await db.select()
            .from(distributor_profile)
            .where(eq(distributor_profile.user_id, req.user.user_id));

        if (distributorProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Distributor profile not found' 
            });
        }

        const distributorId = distributorProfiles[0].distributor_id;
        const { batch_no, distributed_date, target_exporter_id } = req.body;

        // Verify that the batch exists and is collected by distributor
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

        // Check if batch is collected by distributor
        if (!batch.collected_by_distributor) {
            return res.status(400).json({ 
                success: false,
                message: 'Batch must be collected by distributor before marking as distributed' 
            });
        }

        // Check if batch is already distributed
        if (batch.is_distributed) {
            return res.status(400).json({ 
                success: false,
                message: 'This batch has already been marked as distributed' 
            });
        }

        // Verify that the distribute record belongs to this distributor
        if (!batch.distribute_id) {
            return res.status(400).json({ 
                success: false,
                message: 'Distribution record not found for this batch' 
            });
        }

        const distributeRecords = await db.select()
            .from(distribute_table)
            .where(and(
                eq(distribute_table.distribute_id, batch.distribute_id),
                eq(distribute_table.distributor_id, distributorId)
            ));

        if (distributeRecords.length === 0) {
            return res.status(403).json({ 
                success: false,
                message: 'You do not have permission to distribute this batch' 
            });
        }

        const result = await db.transaction(async (tx) => {
            // update distribute_table with the date and target exporter
            const updatedDistribute = await tx.update(distribute_table)
                .set({ 
                    distributed_date: distributed_date,
                    target_exporter_id: target_exporter_id || null, // null means public
                    updated_at: sql`NOW()`
                })
                .where(eq(distribute_table.distribute_id, batch.distribute_id))
                .returning();

            // update main table
            await tx.update(main)
                .set({ 
                    is_distributed: true,
                    updated_at: sql`NOW()`
                })
                .where(eq(main.batch_no, batch_no));

            return updatedDistribute[0];
        });

        // create distribution completion on blockchain
        const blockchainResult = await BlockchainHelper.recordDistributionComplete(
            {
                distributed_date: distributed_date,
                distribute_id: batch.distribute_id,
                target_exporter_id: target_exporter_id || null
            },
            batch_no,
            req.user.user_id,
            distributorId
        );

        res.json({
            success: true,
            message: 'Batch marked as distributed successfully',
            distribution: result,
            batch_no: batch_no,
            blockchain: blockchainResult
        });
    } catch (error) {
        console.error("Error marking batch as distributed:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to mark batch as distributed", 
            error: error.message 
        });
    }
};

