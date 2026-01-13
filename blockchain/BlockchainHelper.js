import { blockchainService, TransactionTypes, KeyManager } from './BlockchainService.js';
import { Transaction } from './Transaction.js';
import { TransactionSigner } from './CryptoUtils.js';


// blockchain operations supply chain
export class BlockchainHelper {
    
    
    // record cultivation/batch creation on blockchain
    static async recordCultivation(cultivationData, batchNo, farmerUserId, farmerId) {
        try {
            // Get user's private key
            const privateKey = await KeyManager.getPrivateKey(farmerUserId);
            const publicKey = await KeyManager.getPublicKey(farmerUserId);
            
            const signedTx = await TransactionSigner.createSignedTransaction({
                transactionType: TransactionTypes.BATCH_CREATE,
                batchNo: batchNo,
                actorUserId: farmerUserId,
                actorRole: 'farmer',
                privateKey: privateKey,
                transactionData: {
                    batchNo: batchNo,
                    farmId: cultivationData.farm_id || null,
                    farmerId: farmerId,
                    dateOfPlanting: cultivationData.date_of_planting || null,
                    seedingSource: cultivationData.seeding_source || null,
                    typeOfFertilizers: cultivationData.type_of_fertilizers || null,
                    pesticides: cultivationData.pesticides || null,
                    organicCertification: cultivationData.organic_certification || null,
                    expectedHarvestDate: cultivationData.expected_harvest_date || null,
                    noOfTrees: cultivationData.no_of_trees || null
                },
                documentHashes: cultivationData.organic_certification ? {
                    organicCertification: cultivationData.organic_certification
                } : null
            });

            // Add public key to transaction
            signedTx.actorPublicKey = publicKey;

            const transaction = new Transaction(signedTx);
            const result = await blockchainService.addTransaction(transaction, true);

            if (result.success && result.block) {
                return {
                    success: true,
                    transactionHash: transaction.hash,
                    blockNumber: result.block.blockNumber,
                    blockHash: result.block.hash
                };
            }

            return { success: true, transactionHash: transaction.hash, pending: true };
        } catch (error) {
            console.error('[BCH] Error recording cultivation:', error.message);
            
            // Provide helpful error message if keys are missing
            if (error.message.includes('No active keys found') || error.message.includes('Private key is required')) {
                return { 
                    success: false, 
                    error: error.message,
                    helpMessage: 'Please generate your blockchain keys first by calling POST /api/blockchain/keys/generate'
                };
            }
            
            return { success: false, error: error.message };
        }
    }

    // record harvest on blockchain
    static async recordHarvest(harvestData, batchNo, farmerUserId) {
        try {
            const privateKey = await KeyManager.getPrivateKey(farmerUserId);
            const publicKey = await KeyManager.getPublicKey(farmerUserId);
            
            const signedTx = await TransactionSigner.createSignedTransaction({
                transactionType: TransactionTypes.HARVEST_RECORD,
                batchNo: batchNo,
                actorUserId: farmerUserId,
                actorRole: 'farmer',
                privateKey: privateKey,
                transactionData: {
                    harvestDate: harvestData.harvest_date || null,
                    harvestMethod: harvestData.harvest_method || null,
                    quantity: harvestData.quantity || null,
                    harvestId: harvestData.harvest_id || null
                }
            });

            signedTx.actorPublicKey = publicKey;

            const transaction = new Transaction(signedTx);
            const result = await blockchainService.addTransaction(transaction, true);

            if (result.success && result.block) {
                return {
                    success: true,
                    transactionHash: transaction.hash,
                    blockNumber: result.block.blockNumber,
                    blockHash: result.block.hash
                };
            }

            return { success: true, transactionHash: transaction.hash, pending: true };
        } catch (error) {
            console.error('[BCH] Error recording harvest:', error.message);
            if (error.message.includes('No active keys found') || error.message.includes('Private key is required')) {
                return { success: false, error: error.message, helpMessage: 'Please generate your blockchain keys first' };
            }
            return { success: false, error: error.message };
        }
    }

    // record collection on blockchain
    static async recordCollection(collectionData, batchNo, collectorUserId, collectorId, farmerId) {
        try {
            const privateKey = await KeyManager.getPrivateKey(collectorUserId);
            const publicKey = await KeyManager.getPublicKey(collectorUserId);
            
            const signedTx = await TransactionSigner.createSignedTransaction({
                transactionType: TransactionTypes.COLLECTION_RECORD,
                batchNo: batchNo,
                actorUserId: collectorUserId,
                actorRole: 'collector',
                privateKey: privateKey,
                transactionData: {
                    collectorId: collectorId,
                    collectedDate: collectionData.collected_date || null,
                    collectId: collectionData.collect_id || null
                },
                fromEntityId: farmerId,
                toEntityId: collectorId
            });

            signedTx.actorPublicKey = publicKey;

            const transaction = new Transaction(signedTx);
            const result = await blockchainService.addTransaction(transaction, true);

            if (result.success && result.block) {
                return {
                    success: true,
                    transactionHash: transaction.hash,
                    blockNumber: result.block.blockNumber,
                    blockHash: result.block.hash
                };
            }

            return { success: true, transactionHash: transaction.hash, pending: true };
        } catch (error) {
            console.error('[BCH] Error recording collection:', error.message);
            if (error.message.includes('No active keys found') || error.message.includes('Private key is required')) {
                return { success: false, error: error.message, helpMessage: 'Please generate your blockchain keys first' };
            }
            return { success: false, error: error.message };
        }
    }


    // record transport start on blockchain
    static async recordTransportStart(transportData, batchNo, collectorUserId, collectorId, processorId) {
        try {
            const privateKey = await KeyManager.getPrivateKey(collectorUserId);
            const publicKey = await KeyManager.getPublicKey(collectorUserId);
            
            const signedTx = await TransactionSigner.createSignedTransaction({
                transactionType: TransactionTypes.TRANSPORT_START,
                batchNo: batchNo,
                actorUserId: collectorUserId,
                actorRole: 'collector',
                privateKey: privateKey,
                transactionData: {
                    collectorId: collectorId,
                    processorId: processorId,
                    transportMethod: transportData.transport_method || null,
                    transportStartedDate: transportData.transport_started_date || null,
                    storageConditions: transportData.storage_conditions || null,
                    transportId: transportData.transport_id || null
                },
                fromEntityId: collectorId,
                toEntityId: processorId
            });

            signedTx.actorPublicKey = publicKey;

            const transaction = new Transaction(signedTx);
            const result = await blockchainService.addTransaction(transaction, true);

            if (result.success && result.block) {
                return {
                    success: true,
                    transactionHash: transaction.hash,
                    blockNumber: result.block.blockNumber,
                    blockHash: result.block.hash
                };
            }

            return { success: true, transactionHash: transaction.hash, pending: true };
        } catch (error) {
            console.error('[BCH] Error recording transport start:', error.message);
            if (error.message.includes('No active keys found') || error.message.includes('Private key is required')) {
                return { success: false, error: error.message, helpMessage: 'Please generate your blockchain keys first' };
            }
            return { success: false, error: error.message };
        }
    }

    // record transport end on blockchain
    static async recordTransportEnd(transportData, batchNo, actorUserId, collectorId, processorId) {
        try {
            const privateKey = await KeyManager.getPrivateKey(actorUserId);
            const publicKey = await KeyManager.getPublicKey(actorUserId);
            
            const signedTx = await TransactionSigner.createSignedTransaction({
                transactionType: TransactionTypes.TRANSPORT_END,
                batchNo: batchNo,
                actorUserId: actorUserId,
                actorRole: 'processor', // Default to processor as recipient
                privateKey: privateKey,
                transactionData: {
                    collectorId: collectorId,
                    processorId: processorId,
                    transportEndedDate: transportData.transport_ended_date || null,
                    transportId: transportData.transport_id || null
                },
                fromEntityId: collectorId,
                toEntityId: processorId
            });

            signedTx.actorPublicKey = publicKey;

            const transaction = new Transaction(signedTx);
            const result = await blockchainService.addTransaction(transaction, true);

            if (result.success && result.block) {
                return {
                    success: true,
                    transactionHash: transaction.hash,
                    blockNumber: result.block.blockNumber,
                    blockHash: result.block.hash
                };
            }

            return { success: true, transactionHash: transaction.hash, pending: true };
        } catch (error) {
            console.error('[BCH] Error recording transport end:', error.message);
            if (error.message.includes('No active keys found') || error.message.includes('Private key is required')) {
                return { success: false, error: error.message, helpMessage: 'Please generate your blockchain keys first' };
            }
            return { success: false, error: error.message };
        }
    }

    // record drying on blockchain
    static async recordDrying(dryingData, batchNo, processorUserId, processorId) {
        try {
            const privateKey = await KeyManager.getPrivateKey(processorUserId);
            const publicKey = await KeyManager.getPublicKey(processorUserId);
            
            const signedTx = await TransactionSigner.createSignedTransaction({
                transactionType: TransactionTypes.DRYING_RECORD,
                batchNo: batchNo,
                actorUserId: processorUserId,
                actorRole: 'processor',
                privateKey: privateKey,
                transactionData: {
                    processorId: processorId,
                    dryStartedDate: dryingData.dry_started_date || null,
                    dryEndedDate: dryingData.dry_ended_date || null,
                    moistureContent: dryingData.moisture_content || null,
                    driedWeight: dryingData.dried_weight || null,
                    processId: dryingData.process_id || null
                }
            });

            signedTx.actorPublicKey = publicKey;

            const transaction = new Transaction(signedTx);
            const result = await blockchainService.addTransaction(transaction, true);

            if (result.success && result.block) {
                return {
                    success: true,
                    transactionHash: transaction.hash,
                    blockNumber: result.block.blockNumber,
                    blockHash: result.block.hash
                };
            }

            return { success: true, transactionHash: transaction.hash, pending: true };
        } catch (error) {
            console.error('[BCH] Error recording drying:', error.message);
            if (error.message.includes('No active keys found') || error.message.includes('Private key is required')) {
                return { success: false, error: error.message, helpMessage: 'Please generate your blockchain keys first' };
            }
            return { success: false, error: error.message };
        }
    }

    // record grading on blockchain
    static async recordGrading(gradingData, batchNo, processorUserId, graderSignUrl) {
        try {
            const privateKey = await KeyManager.getPrivateKey(processorUserId);
            const publicKey = await KeyManager.getPublicKey(processorUserId);
            
            const signedTx = await TransactionSigner.createSignedTransaction({
                transactionType: TransactionTypes.GRADING_RECORD,
                batchNo: batchNo,
                actorUserId: processorUserId,
                actorRole: 'processor',
                privateKey: privateKey,
                transactionData: {
                    gradedDate: gradingData.graded_date || null,
                    graderId: gradingData.grader_id || null,
                    graderSign: gradingData.grader_sign || null,
                    processId: gradingData.process_id || null
                },
                documentHashes: graderSignUrl ? {
                    graderSignature: graderSignUrl
                } : null
            });

            signedTx.actorPublicKey = publicKey;

            const transaction = new Transaction(signedTx);
            const result = await blockchainService.addTransaction(transaction, true);

            if (result.success && result.block) {
                return {
                    success: true,
                    transactionHash: transaction.hash,
                    blockNumber: result.block.blockNumber,
                    blockHash: result.block.hash
                };
            }

            return { success: true, transactionHash: transaction.hash, pending: true };
        } catch (error) {
            console.error('[BCH] Error recording grading:', error.message);
            if (error.message.includes('No active keys found') || error.message.includes('Private key is required')) {
                return { success: false, error: error.message, helpMessage: 'Please generate your blockchain keys first' };
            }
            return { success: false, error: error.message };
        }
    }

    // record packing on blockchain
    static async recordPacking(packingData, batchNo, processorUserId) {
        try {
            const privateKey = await KeyManager.getPrivateKey(processorUserId);
            const publicKey = await KeyManager.getPublicKey(processorUserId);
            
            const signedTx = await TransactionSigner.createSignedTransaction({
                transactionType: TransactionTypes.PACKING_RECORD,
                batchNo: batchNo,
                actorUserId: processorUserId,
                actorRole: 'processor',
                privateKey: privateKey,
                transactionData: {
                    packedDate: packingData.packed_date || null,
                    packedBy: packingData.packed_by || null,
                    packingType: packingData.packing_type || null,
                    packageWeight: packingData.package_weight || null,
                    processId: packingData.process_id || null
                }
            });

            signedTx.actorPublicKey = publicKey;

            const transaction = new Transaction(signedTx);
            const result = await blockchainService.addTransaction(transaction, true);

            if (result.success && result.block) {
                return {
                    success: true,
                    transactionHash: transaction.hash,
                    blockNumber: result.block.blockNumber,
                    blockHash: result.block.hash
                };
            }

            return { success: true, transactionHash: transaction.hash, pending: true };
        } catch (error) {
            console.error('[BCH] Error recording packing:', error.message);
            if (error.message.includes('No active keys found') || error.message.includes('Private key is required')) {
                return { success: false, error: error.message, helpMessage: 'Please generate your blockchain keys first' };
            }
            return { success: false, error: error.message };
        }
    }


    // record distribution collect on blockchain
    static async recordDistributionCollect(distributionData, batchNo, distributorUserId, distributorId, processorId) {
        try {
            const privateKey = await KeyManager.getPrivateKey(distributorUserId);
            const publicKey = await KeyManager.getPublicKey(distributorUserId);
            
            const signedTx = await TransactionSigner.createSignedTransaction({
                transactionType: TransactionTypes.DISTRIBUTION_COLLECT,
                batchNo: batchNo,
                actorUserId: distributorUserId,
                actorRole: 'distributor',
                privateKey: privateKey,
                transactionData: {
                    distributorId: distributorId,
                    collectedDate: distributionData.collected_date || null,
                    distributeId: distributionData.distribute_id || null
                },
                fromEntityId: processorId,
                toEntityId: distributorId
            });

            signedTx.actorPublicKey = publicKey;

            const transaction = new Transaction(signedTx);
            const result = await blockchainService.addTransaction(transaction, true);

            if (result.success && result.block) {
                return {
                    success: true,
                    transactionHash: transaction.hash,
                    blockNumber: result.block.blockNumber,
                    blockHash: result.block.hash
                };
            }

            return { success: true, transactionHash: transaction.hash, pending: true };
        } catch (error) {
            console.error('[BCH] Error recording distribution:', error.message);
            if (error.message.includes('No active keys found') || error.message.includes('Private key is required')) {
                return { success: false, error: error.message, helpMessage: 'Please generate your blockchain keys first' };
            }
            return { success: false, error: error.message };
        }
    }


    // record distribution complete on blockchain
    static async recordDistributionComplete(distributionData, batchNo, distributorUserId, distributorId) {
        try {
            const privateKey = await KeyManager.getPrivateKey(distributorUserId);
            const publicKey = await KeyManager.getPublicKey(distributorUserId);
            
            const signedTx = await TransactionSigner.createSignedTransaction({
                transactionType: TransactionTypes.DISTRIBUTION_COMPLETE,
                batchNo: batchNo,
                actorUserId: distributorUserId,
                actorRole: 'distributor',
                privateKey: privateKey,
                transactionData: {
                    distributorId: distributorId,
                    distributedDate: distributionData.distributed_date || null,
                    distributeId: distributionData.distribute_id || null
                }
            });

            signedTx.actorPublicKey = publicKey;

            const transaction = new Transaction(signedTx);
            const result = await blockchainService.addTransaction(transaction, true);

            if (result.success && result.block) {
                return {
                    success: true,
                    transactionHash: transaction.hash,
                    blockNumber: result.block.blockNumber,
                    blockHash: result.block.hash
                };
            }

            return { success: true, transactionHash: transaction.hash, pending: true };
        } catch (error) {
            console.error('[BCH] Error recording distribution complete:', error.message);
            if (error.message.includes('No active keys found') || error.message.includes('Private key is required')) {
                return { success: false, error: error.message, helpMessage: 'Please generate your blockchain keys first' };
            }
            return { success: false, error: error.message };
        }
    }


    // record export collect on blockchain
    static async recordExportCollect(exportData, batchNo, exporterUserId, exporterId, distributorId) {
        try {
            const privateKey = await KeyManager.getPrivateKey(exporterUserId);
            const publicKey = await KeyManager.getPublicKey(exporterUserId);
            
            const signedTx = await TransactionSigner.createSignedTransaction({
                transactionType: TransactionTypes.EXPORT_COLLECT,
                batchNo: batchNo,
                actorUserId: exporterUserId,
                actorRole: 'exporter',
                privateKey: privateKey,
                transactionData: {
                    exporterId: exporterId,
                    collectedDate: exportData.collected_date || null,
                    exportId: exportData.export_id || null
                },
                fromEntityId: distributorId,
                toEntityId: exporterId
            });

            signedTx.actorPublicKey = publicKey;

            const transaction = new Transaction(signedTx);
            const result = await blockchainService.addTransaction(transaction, true);

            if (result.success && result.block) {
                return {
                    success: true,
                    transactionHash: transaction.hash,
                    blockNumber: result.block.blockNumber,
                    blockHash: result.block.hash
                };
            }

            return { success: true, transactionHash: transaction.hash, pending: true };
        } catch (error) {
            console.error('[BCH] Error recording export collect:', error.message);
            if (error.message.includes('No active keys found') || error.message.includes('Private key is required')) {
                return { success: false, error: error.message, helpMessage: 'Please generate your blockchain keys first' };
            }
            return { success: false, error: error.message };
        }
    }


    // record export on blockchain
    static async recordExport(exportData, batchNo, exporterUserId) {
        try {
            const privateKey = await KeyManager.getPrivateKey(exporterUserId);
            const publicKey = await KeyManager.getPublicKey(exporterUserId);
            
            const signedTx = await TransactionSigner.createSignedTransaction({
                transactionType: TransactionTypes.EXPORT_RECORD,
                batchNo: batchNo,
                actorUserId: exporterUserId,
                actorRole: 'exporter',
                privateKey: privateKey,
                transactionData: {
                    exportedTo: exportData.exported_to || null,
                    exportedDate: exportData.exported_date || null,
                    exportId: exportData.export_id || null
                }
            });

            signedTx.actorPublicKey = publicKey;

            const transaction = new Transaction(signedTx);
            const result = await blockchainService.addTransaction(transaction, true);

            if (result.success && result.block) {
                return {
                    success: true,
                    transactionHash: transaction.hash,
                    blockNumber: result.block.blockNumber,
                    blockHash: result.block.hash
                };
            }

            return { success: true, transactionHash: transaction.hash, pending: true };
        } catch (error) {
            console.error('[BCH] Error recording export:', error.message);
            if (error.message.includes('No active keys found') || error.message.includes('Private key is required')) {
                return { success: false, error: error.message, helpMessage: 'Please generate your blockchain keys first' };
            }
            return { success: false, error: error.message };
        }
    }
}
