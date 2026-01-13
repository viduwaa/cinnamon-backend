import { db } from '../config/db.js';
import { user, exporter_profile, main, export_table, farms, farmer_profile, cultivation, harvest, collect_table, collector_profile, transport, process, distribute_table } from '../src/db/schema.js';
import { eq, and, sql, or } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { validationResult } from 'express-validator';
import { generateToken } from '../utils/jwt.js';
import { uploadToGoogleDrive } from '../utils/googleDrive.js';
import { BlockchainHelper } from '../blockchain/BlockchainHelper.js';

const sanitizeUser = (userInstance) => {
    const { password_hash, ...userWithoutPassword } = userInstance;
    return userWithoutPassword;
};

//test comment
export const registerExporter = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            errors: errors.array() 
        });
    }

    const { name, email, password, phone } = req.body;

    // Check if file was uploaded for exporter_license
    if (!req.file) {
        return res.status(400).json({ 
            success: false,
            message: 'Exporter license document is required' 
        });
    }

    try {
        // Check if user already exists before starting transaction
        const userExists = await db.select().from(user).where(eq(user.email, email));
        if (userExists.length > 0) {
            return res.status(400).json({ 
                success: false,
                message: 'User already exists' 
            });
        }

        // Upload exporter license file to Google Drive with unique filename using email
        let licenseLink = null;
        try {
            // Create unique filename using email (sanitized for filename)
            const sanitizedEmail = email.replace(/[^a-zA-Z0-9]/g, '-');
            const customFileName = `exporter-license-${sanitizedEmail}`;
            const driveFileData = await uploadToGoogleDrive(req.file, 'Exporter License', customFileName);
            licenseLink = driveFileData.webViewLink;
        } catch (uploadError) {
            console.error('Error uploading exporter license to Google Drive:', uploadError);
            return res.status(500).json({ 
                success: false,
                message: 'Failed to upload exporter license document to Google Drive',
                error: uploadError.message
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
                role_id: 5, // exporter role
                status: 'active'
            }).returning();

            await tx.insert(exporter_profile).values({
                user_id: newUser[0].user_id,
                exporter_license: licenseLink // google drive link
            });

            return newUser[0];
        });

        const sanitizedUser = sanitizeUser(result);
        
        res.status(201).json({
            success: true,
            message: 'Exporter registered successfully',
            user: sanitizedUser,
            token: generateToken(result.user_id)
        });
    } catch (error) {
        console.error("Error registering exporter:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to register exporter", 
            error: error.message 
        });
    }
};

export const loginExporter = async (req, res) => {
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

        if (userInstance.role_id !== 5) {
            return res.status(403).json({ 
                success: false,
                message: 'Not authorized as an exporter' 
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
        console.error("Error logging in exporter:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to login exporter", 
            error: error.message 
        });
    }
};

export const getExporterProfile = async (req, res) => {
    try {
        // Verify user is an exporter
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 5) {
            return res.status(403).json({ 
                success: false,
                message: 'Only exporters can access exporter profile' 
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

        // Get exporter profile information
        const exporterProfiles = await db.select()
            .from(exporter_profile)
            .where(eq(exporter_profile.user_id, req.user.user_id));

        if (exporterProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Exporter profile not found' 
            });
        }

        // Combine user and exporter profile data
        const userData = sanitizeUser(users[0]);
        const exporterData = exporterProfiles[0];

        res.json({
            success: true,
            profile: {
                ...userData,
                exporter_profile: {
                    exporter_id: exporterData.exporter_id,
                    exporter_license: exporterData.exporter_license,
                    created_at: exporterData.created_at,
                    updated_at: exporterData.updated_at
                }
            }
        });
    } catch (error) {
        console.error("Error fetching exporter profile:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to fetch exporter profile", 
            error: error.message 
        });
    }
};

// Get available distributed batches
export const getAvailableBatches = async (req, res) => {
    try {
        // Verify user is an exporter
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 5) {
            return res.status(403).json({ 
                success: false,
                message: 'Only exporters can view available batches' 
            });
        }

        // Get exporter_id from exporter_profile using user_id
        const exporterProfiles = await db.select()
            .from(exporter_profile)
            .where(eq(exporter_profile.user_id, req.user.user_id));

        if (exporterProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Exporter profile not found' 
            });
        }

        const exporterId = exporterProfiles[0].exporter_id;
        
        // Get batches that are distributed but not yet collected by exporter
        // Filter: Public (target_exporter_id is NULL) OR Targeted to this exporter
        const availableBatches = await db.select({
                ...main,
                distribute_target_id: distribute_table.target_exporter_id
            })
            .from(main)
            .leftJoin(distribute_table, eq(main.distribute_id, distribute_table.distribute_id))
            .where(and(
                eq(main.is_distributed, true),
                eq(main.collected_by_exporter, false),
                or(
                    sql`${distribute_table.target_exporter_id} IS NULL`,
                    eq(distribute_table.target_exporter_id, exporterId)
                )
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

// Mark as collected by exporter
export const markAsCollectedByExporter = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            errors: errors.array() 
        });
    }

    try {
        // Verify user is an exporter
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 5) {
            return res.status(403).json({ 
                success: false,
                message: 'Only exporters can collect batches' 
            });
        }

        // Get exporter_id from exporter_profile using user_id
        const exporterProfiles = await db.select()
            .from(exporter_profile)
            .where(eq(exporter_profile.user_id, req.user.user_id));

        if (exporterProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Exporter profile not found' 
            });
        }

        const exporterId = exporterProfiles[0].exporter_id;
        const { batch_no, collected_date } = req.body;

        // Verify that the batch exists and is distributed
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

        // Check if batch is distributed
        if (!batch.is_distributed) {
            return res.status(400).json({ 
                success: false,
                message: 'Batch must be distributed before collection by exporter' 
            });
        }

        // Check if batch is already collected by exporter
        if (batch.collected_by_exporter) {
            return res.status(400).json({ 
                success: false,
                message: 'This batch has already been collected by exporter' 
            });
        }

        const result = await db.transaction(async (tx) => {
            // create export_table record
            const newExport = await tx.insert(export_table).values({
                batch_no: batch_no,
                exporter_id: exporterId,
                collected_date: collected_date
            }).returning();

            // update main table
            await tx.update(main)
                .set({ 
                    collected_by_exporter: true,
                    export_id: newExport[0].export_id,
                    updated_at: sql`NOW()`
                })
                .where(eq(main.batch_no, batch_no));

            return newExport[0];
        });

        // write export collection on blockchain
        const blockchainResult = await BlockchainHelper.recordExportCollect(
            {
                collected_date: collected_date,
                export_id: result.export_id
            },
            batch_no,
            req.user.user_id,
            exporterId,
            batch.distributor_id
        );

        res.status(201).json({
            success: true,
            message: 'Batch marked as collected by exporter successfully',
            export: result,
            batch_no: batch_no,
            blockchain: blockchainResult
        });
    } catch (error) {
        console.error("Error marking batch as collected by exporter:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to mark batch as collected by exporter", 
            error: error.message 
        });
    }
};

// Mark as exported
export const markAsExported = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            errors: errors.array() 
        });
    }

    try {
        // Verify user is an exporter
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 5) {
            return res.status(403).json({ 
                success: false,
                message: 'Only exporters can mark batches as exported' 
            });
        }

        // Get exporter_id from exporter_profile using user_id
        const exporterProfiles = await db.select()
            .from(exporter_profile)
            .where(eq(exporter_profile.user_id, req.user.user_id));

        if (exporterProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Exporter profile not found' 
            });
        }

        const exporterId = exporterProfiles[0].exporter_id;
        const { batch_no, exported_to, exported_date } = req.body;

        // Verify that the batch exists and is collected by exporter
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

        // Check if batch is collected by exporter
        if (!batch.collected_by_exporter) {
            return res.status(400).json({ 
                success: false,
                message: 'Batch must be collected by exporter before marking as exported' 
            });
        }

        // Check if batch is already exported
        if (batch.is_exported) {
            return res.status(400).json({ 
                success: false,
                message: 'This batch has already been marked as exported' 
            });
        }

        // Verify that the export record belongs to this exporter
        if (!batch.export_id) {
            return res.status(400).json({ 
                success: false,
                message: 'Export record not found for this batch' 
            });
        }

        const exportRecords = await db.select()
            .from(export_table)
            .where(and(
                eq(export_table.export_id, batch.export_id),
                eq(export_table.exporter_id, exporterId)
            ));

        if (exportRecords.length === 0) {
            return res.status(403).json({ 
                success: false,
                message: 'You do not have permission to export this batch' 
            });
        }


        const result = await db.transaction(async (tx) => {
            // update export_table with dates
            const updatedExport = await tx.update(export_table)
                .set({ 
                    exported_to: exported_to,
                    exported_date: exported_date,
                    updated_at: sql`NOW()`
                })
                .where(eq(export_table.export_id, batch.export_id))
                .returning();

            // update main table
            await tx.update(main)
                .set({ 
                    is_exported: true,
                    updated_at: sql`NOW()`
                })
                .where(eq(main.batch_no, batch_no));

            return updatedExport[0];
        });

        // write export on blockchain
        const blockchainResult = await BlockchainHelper.recordExport(
            {
                exported_to: exported_to,
                exported_date: exported_date,
                export_id: batch.export_id
            },
            batch_no,
            req.user.user_id,
            exporterId
        );

        res.json({
            success: true,
            message: 'Batch marked as exported successfully',
            export: result,
            batch_no: batch_no,
            blockchain: blockchainResult
        });
    } catch (error) {
        console.error("Error marking batch as exported:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to mark batch as exported", 
            error: error.message 
        });
    }
};


// Get exporter's collected/exported batches
export const getMyExports = async (req, res) => {
    try {
        // Verify user is an exporter
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 5) {
            return res.status(403).json({ 
                success: false,
                message: 'Only exporters can view their exports' 
            });
        }

        // Get exporter_id from exporter_profile using user_id
        const exporterProfiles = await db.select()
            .from(exporter_profile)
            .where(eq(exporter_profile.user_id, req.user.user_id));

        if (exporterProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Exporter profile not found' 
            });
        }

        const exporterId = exporterProfiles[0].exporter_id;

        // Get all exports for this exporter with batch info
        const exports = await db.select({
            export_id: export_table.export_id,
            batch_no: export_table.batch_no,
            collected_date: export_table.collected_date,
            exported_to: export_table.exported_to,
            exported_date: export_table.exported_date,
            created_at: export_table.created_at,
            // Main table info
            harvested_quantity: main.harvested_quantity,
            dried_weight: main.dried_weight,
            is_exported: main.is_exported
        })
            .from(export_table)
            .leftJoin(main, eq(export_table.batch_no, main.batch_no))
            .where(eq(export_table.exporter_id, exporterId))
            .orderBy(sql`${export_table.created_at} DESC`);

        // Transform to include status
        const exportsWithStatus = exports.map(e => ({
            ...e,
            status: e.is_exported ? 'exported' : 'collected'
        }));

        res.json({
            success: true,
            exports: exportsWithStatus
        });
    } catch (error) {
        console.error("Error fetching exporter's exports:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to fetch exports", 
            error: error.message 
        });
    }
};

// Get export details with batch chain history
export const getExportDetails = async (req, res) => {
    try {
        const { batchNo } = req.params;
        
        // Verify user is an exporter
        const userRoleId = Number(req.user.role_id);
        
        if (isNaN(userRoleId) || userRoleId !== 5) {
            return res.status(403).json({ 
                success: false,
                message: 'Only exporters can view export details' 
            });
        }

        // Get exporter_id from exporter_profile
        const exporterProfiles = await db.select()
            .from(exporter_profile)
            .where(eq(exporter_profile.user_id, req.user.user_id));

        if (exporterProfiles.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Exporter profile not found' 
            });
        }

        const exporterId = exporterProfiles[0].exporter_id;

        // Get export record
        const exportRecords = await db.select()
            .from(export_table)
            .where(and(
                eq(export_table.batch_no, batchNo),
                eq(export_table.exporter_id, exporterId)
            ));

        if (exportRecords.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Export not found or you do not have access to this batch' 
            });
        }

        const exportData = exportRecords[0];

        // Get batch info from main table
        const batchRecords = await db.select()
            .from(main)
            .where(eq(main.batch_no, batchNo));

        if (batchRecords.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Batch not found' 
            });
        }

        const batch = batchRecords[0];

        // CHAIN DATA (Similar to distributor but including distribution)
        
        // Get farm info
        let farmData = null;
        if (batch.farm_id) {
            const farmRecords = await db.select().from(farms).where(eq(farms.farm_id, batch.farm_id));
            if (farmRecords.length > 0) farmData = farmRecords[0];
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
            if (farmerRecords.length > 0) farmerData = farmerRecords[0];
        }

        // Get cultivation info
        let cultivationData = null;
        if (batch.cultivation_id) {
            const cultivationRecords = await db.select().from(cultivation).where(eq(cultivation.cultivation_id, batch.cultivation_id));
            if (cultivationRecords.length > 0) cultivationData = cultivationRecords[0];
        }

        // Get harvest info
        let harvestData = null;
        if (batch.harvest_id) {
            const harvestRecords = await db.select().from(harvest).where(eq(harvest.harvest_id, batch.harvest_id));
            if (harvestRecords.length > 0) harvestData = harvestRecords[0];
        }

        // Get collection info
        let collectionData = null;
        let collectorData = null;
        if (batch.collection_id) {
            const collectionRecords = await db.select().from(collect_table).where(eq(collect_table.collection_id, batch.collection_id));
            if (collectionRecords.length > 0) {
                collectionData = collectionRecords[0];
                if (collectionData.collector_id) {
                    const collectorRecords = await db.select({
                        collector_id: collector_profile.collector_id,
                        user_id: collector_profile.user_id,
                        name: user.name
                    })
                    .from(collector_profile)
                    .leftJoin(user, eq(collector_profile.user_id, user.user_id))
                    .where(eq(collector_profile.collector_id, collectionData.collector_id));
                    if (collectorRecords.length > 0) collectorData = collectorRecords[0];
                }
            }
        }

        // Get transport info
        let transportData = null;
        if (batch.transport_id) {
            const transportRecords = await db.select().from(transport).where(eq(transport.transport_id, batch.transport_id));
            if (transportRecords.length > 0) transportData = transportRecords[0];
        }

        // Get process info
        let processData = null;
        if (batch.process_id) {
            const processRecords = await db.select().from(process).where(eq(process.process_id, batch.process_id));
            if (processRecords.length > 0) processData = processRecords[0];
        }

        // Get distribution info (Crucial for exporter)
        let distributionData = null;
        if (batch.distribute_id) {
            const distributionRecords = await db.select().from(distribute_table).where(eq(distribute_table.distribute_id, batch.distribute_id));
            if (distributionRecords.length > 0) distributionData = distributionRecords[0];
        }

        res.json({
            success: true,
            batch: {
                batch_no: batch.batch_no,
                harvested_quantity: batch.harvested_quantity,
                dried_weight: batch.dried_weight,
                isProcessed: batch.isProcessed,
                is_distributed: batch.is_distributed,
                collected_by_exporter: batch.collected_by_exporter,
                is_exported: batch.is_exported,
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
            distribution: distributionData,
            export: exportData
        });
    } catch (error) {
        console.error("Error fetching export details:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to fetch export details", 
            error: error.message 
        });
    }
};
