import { timestamptz } from 'drizzle-orm/gel-core';
import { pgTable, serial, integer, numeric, text, date, boolean, jsonb, varchar, index } from 'drizzle-orm/pg-core';

export const role = pgTable('role', {
  role_id: serial('role_id').primaryKey(),
  role_name: text('role_name').notNull(),
  created_at: timestamptz('created_at').defaultNow()
});

export const user = pgTable('user', {
  user_id: serial('user_id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  phone: text('phone').notNull(),
  role_id: integer('role_id').references(() => role.role_id),
  status: text('status').notNull(),
  created_at: timestamptz('created_at').defaultNow(),
  updated_at: timestamptz('updated_at').defaultNow()
});

export const farmer_profile = pgTable('farmer_profile', {
  farmer_id: serial('farmer_id').primaryKey(),
  user_id: integer('user_id').references(() => user.user_id, { onDelete: 'cascade' }).notNull(),
  nic: text('nic').notNull().unique(),
  address: text('address').notNull(),
  gender: text('gender').notNull(),
  date_of_birth: date('date_of_birth'),
  created_at: timestamptz('created_at').defaultNow(),
  updated_at: timestamptz('updated_at').defaultNow()
});

export const farms = pgTable('farms', {
  farm_id: serial('farm_id').primaryKey(),
  farmer_id: integer('farmer_id').references(() => farmer_profile.farmer_id, { onDelete: 'cascade' }).notNull(),
  farm_name: text('farm_name').notNull(),
  gps_coordinates: text('gps_coordinates').notNull(),
  area_acres: numeric('area_acres').notNull(),
  created_at: timestamptz('created_at').defaultNow(),
  updated_at: timestamptz('updated_at').defaultNow()
});

export const main = pgTable('main', {
  batch_no: text('batch_no').primaryKey(),
  farm_id: integer('farm_id').references(() => farms.farm_id, { onDelete: 'cascade' }),
  farmer_id: integer('farmer_id').references(() => farmer_profile.farmer_id, { onDelete: 'cascade' }),
  cultivation_id: integer('cultivation_id').references(() => cultivation.cultivation_id, { onDelete: 'cascade' }),
  is_harvested: boolean('is_harvested').default(false),
  harvest_id: integer('harvest_id').references(() => harvest.harvest_id, { onDelete: 'cascade' }),
  harvested_quantity: numeric('harvested_quantity'),
  collect_id: integer('collect_id').references(() => collect_table.collect_id, { onDelete: 'cascade' }),
  is_collected: boolean('is_collected').default(false),
  transport_id: integer('transport_id').references(() => transport.transport_id, { onDelete: 'cascade' }),
  inTransporting: boolean('inTransporting').default(false),
  isTransported: boolean('isTransported').default(false),
  processor_id: integer('processor_id').references(() => processor_profile.processor_id, { onDelete: 'cascade' }),
  process_id: integer('process_id').references(() => process.process_id, { onDelete: 'cascade' }),
  inProcess: boolean('inProcess').default(false),
  dried_weight: numeric('dried_weight'),
  isProcessed: boolean('isProcessed').default(false),
  distribute_id: integer('distribute_id').references(() => distribute_table.distribute_id, { onDelete: 'cascade' }),
  collected_by_distributor: boolean('collected_by_distributor').default(false),
  is_distributed: boolean('is_distributed').default(false),
  export_id: integer('export_id').references(() => export_table.export_id, { onDelete: 'cascade' }),
  collected_by_exporter: boolean('collected_by_exporter').default(false),
  is_exported: boolean('is_exported').default(false),
  created_at: timestamptz('created_at').defaultNow(),
  updated_at: timestamptz('updated_at').defaultNow()
});

export const collect_table = pgTable('collect_table', {
  collect_id: serial('collect_id').primaryKey(),
  batch_no: text('batch_no').references(() => main.batch_no, { onDelete: 'cascade' }).notNull(),
  collector_id: integer('collector_id').references(() => collector_profile.collector_id, { onDelete: 'cascade' }).notNull(),
  collected_date: date('collected_date').notNull(),
  created_at: timestamptz('created_at').defaultNow(),
  updated_at: timestamptz('updated_at').defaultNow()
});

export const harvest = pgTable('harvest', {
  harvest_id: serial('harvest_id').primaryKey(),
  batch_no: text('batch_no').references(() => main.batch_no, { onDelete: 'cascade' }),
  harvest_date: date('harvest_date'),
  harvest_method: text('harvest_method'),
  quantity: numeric('quantity'),
  created_at: timestamptz('created_at').defaultNow(),
  updated_at: timestamptz('updated_at').defaultNow()
});

export const cultivation = pgTable('cultivation', {
  cultivation_id: serial('cultivation_id').primaryKey(),
  batch_no: text('batch_no').references(() => main.batch_no, { onDelete: 'cascade' }),
  date_of_planting: date('date_of_planting'),
  seeding_source: text('seeding_source'),
  type_of_fertilizers: text('type_of_fertilizers'),
  pesticides: text('pesticides'),
  organic_certification: text('organic_certification'),
  expected_harvest_date: date('expected_harvest_date'),
  no_of_trees: integer('no_of_trees'),
  created_at: timestamptz('created_at').defaultNow(),
  updated_at: timestamptz('updated_at').defaultNow()
});

export const collector_profile = pgTable('collector_profile', {
  collector_id: serial('collector_id').primaryKey(),
  user_id: integer('user_id').references(() => user.user_id, { onDelete: 'cascade' }).notNull(),
  center_name: text('center_name').notNull(),
  vehicle_id: text('vehicle_id').notNull(),
  location: text('location').notNull(),
  created_at: timestamptz('created_at').defaultNow(),
  updated_at: timestamptz('updated_at').defaultNow()
});

export const transport = pgTable('transport', {
  transport_id: serial('transport_id').primaryKey(),
  batch_no: text('batch_no').references(() => main.batch_no, { onDelete: 'cascade' }),
  collector_id: integer('collector_id').references(() => collector_profile.collector_id, { onDelete: 'cascade' }).notNull(),
  processor_id: integer('processor_id').references(() => processor_profile.processor_id, { onDelete: 'set null' }),
  transport_method: text('transport_method'),
  transport_started_date: date('transport_started_date'),
  transport_ended_date: date('transport_ended_date'),
  storage_conditions: text('storage_conditions'),
  created_at: timestamptz('created_at').defaultNow(),
  updated_at: timestamptz('updated_at').defaultNow()
});

export const processor_profile = pgTable('processor_profile', {
  processor_id: serial('processor_id').primaryKey(),
  user_id: integer('user_id').references(() => user.user_id, { onDelete: 'cascade' }).notNull(),
  process_station_name: text('process_station_name').notNull(),
  process_station_location: text('process_station_location').notNull(),
  created_at: timestamptz('created_at').defaultNow(),
  updated_at: timestamptz('updated_at').defaultNow()
});

export const process = pgTable('process', {
  process_id: serial('process_id').primaryKey(),
  batch_no: text('batch_no').references(() => main.batch_no, { onDelete: 'cascade' }),
  processor_id: integer('processor_id').references(() => processor_profile.processor_id, { onDelete: 'cascade' }).notNull(),
  isDried: boolean('isDried').default(false),
  dry_started_date: date('dry_started_date'),
  dry_ended_date: date('dry_ended_date'),
  moisture_content: numeric('moisture_content'),
  dried_weight: numeric('dried_weight'),
  isGraded: boolean('isGraded').default(false),
  graded_date: date('graded_date'),
  grader_id: integer('grader_id').references(() => grader_profile.grader_id, { onDelete: 'cascade' }),
  grader_sign: text('grader_sign'),
  isPacked: boolean('isPacked').default(false),
  packed_date: date('packed_date'),
  packed_by: text('packed_by'),
  packing_type: text('packing_type'),
  package_weight: numeric('package_weight'),
  processed_date: date('processed_date').defaultNow(),
  updated_at: timestamptz('updated_at').defaultNow()
});

export const grader_profile = pgTable('grader_profile', {
  grader_id: serial('grader_id').primaryKey(),
  grader_name: text('grader_name').notNull(),
  grader_contact: text('grader_contact').notNull(),
  created_at: timestamptz('created_at').defaultNow(),
  updated_at: timestamptz('updated_at').defaultNow()
});


export const distributor_profile = pgTable('distributor_profile', {
  distributor_id: serial('distributor_id').primaryKey(),
  user_id: integer('user_id').references(() => user.user_id, { onDelete: 'cascade' }).notNull(),
  created_at: timestamptz('created_at').defaultNow(),
  updated_at: timestamptz('updated_at').defaultNow()
});

export const distribute_table = pgTable('distribute_table', {
  distribute_id: serial('distribute_id').primaryKey(),
  distributor_id: integer('distributor_id').references(() => distributor_profile.distributor_id, { onDelete: 'cascade' }).notNull(),
  batch_no: text('batch_no').references(() => main.batch_no, { onDelete: 'cascade' }),
  collected_date: date('collected_date'),
  distributed_date: date('distributed_date'),
  target_exporter_id: integer('target_exporter_id').references(() => exporter_profile.exporter_id, { onDelete: 'set null' }),
  created_at: timestamptz('created_at').defaultNow(),
  updated_at: timestamptz('updated_at').defaultNow()
});

export const exporter_profile = pgTable('exporter_profile', {
  exporter_id: serial('exporter_id').primaryKey(),
  user_id: integer('user_id').references(() => user.user_id, { onDelete: 'cascade' }).notNull(),
  exporter_license: text('exporter_license').notNull(),
  created_at: timestamptz('created_at').defaultNow(),
  updated_at: timestamptz('updated_at').defaultNow()
});

export const export_table = pgTable('export_table', {
  export_id: serial('export_id').primaryKey(),
  batch_no: text('batch_no').references(() => main.batch_no, { onDelete: 'cascade' }),
  exporter_id: integer('exporter_id').references(() => exporter_profile.exporter_id, { onDelete: 'cascade' }).notNull(),
  collected_date: date('collected_date'),
  exported_to: text('exported_to'),
  exported_date: date('exported_date'),
  created_at: timestamptz('created_at').defaultNow(),
  updated_at: timestamptz('updated_at').defaultNow()
});
// Blockchain tables (Production-Ready)

export const blockchain_blocks = pgTable('blockchain_blocks', {
  block_id: serial('block_id').primaryKey(),
  block_number: integer('block_number').notNull().unique(),
  previous_hash: varchar('previous_hash', { length: 64 }).notNull(),
  merkle_root: varchar('merkle_root', { length: 64 }).notNull(),
  timestamp: timestamptz('timestamp').notNull().defaultNow(),
  nonce: integer('nonce').notNull().default(0),
  difficulty: integer('difficulty').notNull().default(2),
  block_hash: varchar('block_hash', { length: 64 }).notNull().unique(),
  validator_user_id: integer('validator_user_id').references(() => user.user_id),
  validator_public_key: text('validator_public_key'),
  validator_signature: text('validator_signature'),
  transaction_count: integer('transaction_count').notNull().default(0),
  mining_time_ms: integer('mining_time_ms'),
  is_valid: boolean('is_valid').notNull().default(true),
  created_at: timestamptz('created_at').defaultNow()
}, (table) => {
  return {
    blockNumberIdx: index('block_number_idx').on(table.block_number),
    blockHashIdx: index('block_hash_idx').on(table.block_hash),
    validatorIdx: index('idx_blocks_validator').on(table.validator_user_id),
    difficultyIdx: index('idx_blocks_difficulty').on(table.difficulty),
    timestampIdx: index('idx_blocks_timestamp').on(table.timestamp),
    isValidIdx: index('idx_blocks_is_valid').on(table.is_valid)
  };
});

export const blockchain_transactions = pgTable('blockchain_transactions', {
  transaction_id: serial('transaction_id').primaryKey(),
  transaction_hash: varchar('transaction_hash', { length: 64 }).notNull().unique(),
  block_id: integer('block_id').references(() => blockchain_blocks.block_id, { onDelete: 'restrict' }).notNull(),
  transaction_type: text('transaction_type').notNull(),
  batch_no: text('batch_no').notNull(),
  actor_user_id: integer('actor_user_id').references(() => user.user_id).notNull(),
  actor_role: text('actor_role').notNull(),
  actor_public_key: text('actor_public_key'),
  actor_signature: text('actor_signature').notNull(),
  transaction_data: jsonb('transaction_data').notNull(),
  from_entity_id: integer('from_entity_id'),
  to_entity_id: integer('to_entity_id'),
  document_hashes: jsonb('document_hashes'),
  nonce: text('nonce'),
  timestamp: timestamptz('timestamp').notNull().defaultNow(),
  is_verified: boolean('is_verified').notNull().default(true),
  verification_count: integer('verification_count').notNull().default(1),
  created_at: timestamptz('created_at').defaultNow()
}, (table) => {
  return {
    txHashIdx: index('tx_hash_idx').on(table.transaction_hash),
    batchNoIdx: index('tx_batch_no_idx').on(table.batch_no),
    blockIdIdx: index('tx_block_id_idx').on(table.block_id),
    actorUserIdx: index('idx_tx_actor_user').on(table.actor_user_id),
    batchTimestampIdx: index('idx_tx_batch_timestamp').on(table.batch_no, table.timestamp),
    typeIdx: index('idx_tx_type').on(table.transaction_type),
    nonceIdx: index('idx_tx_nonce').on(table.nonce)
  };
});

export const blockchain_metadata = pgTable('blockchain_metadata', {
  metadata_id: serial('metadata_id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
  updated_at: timestamptz('updated_at').defaultNow()
});

export const batch_blockchain_refs = pgTable('batch_blockchain_refs', {
  ref_id: serial('ref_id').primaryKey(),
  batch_no: text('batch_no').references(() => main.batch_no, { onDelete: 'cascade' }).notNull(),
  stage: text('stage').notNull(),
  transaction_id: integer('transaction_id').references(() => blockchain_transactions.transaction_id, { onDelete: 'restrict' }).notNull(),
  block_id: integer('block_id').references(() => blockchain_blocks.block_id, { onDelete: 'restrict' }).notNull(),
  transaction_hash: varchar('transaction_hash', { length: 64 }).notNull(),
  created_at: timestamptz('created_at').defaultNow()
}, (table) => {
  return {
    batchStageIdx: index('batch_stage_idx').on(table.batch_no, table.stage)
  };
});

// User cryptographic keys table
export const user_keys = pgTable('user_keys', {
  key_id: serial('key_id').primaryKey(),
  user_id: integer('user_id').references(() => user.user_id, { onDelete: 'cascade' }).notNull(),
  public_key: text('public_key').notNull(),
  encrypted_private_key: text('encrypted_private_key').notNull(),
  key_version: integer('key_version').notNull().default(1),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamptz('created_at').defaultNow(),
  updated_at: timestamptz('updated_at').defaultNow()
}, (table) => {
  return {
    userIdx: index('idx_user_keys_user').on(table.user_id),
    activeIdx: index('idx_user_keys_active').on(table.is_active)
  };
});

// Blockchain health monitoring
export const blockchain_health_logs = pgTable('blockchain_health_logs', {
  log_id: serial('log_id').primaryKey(),
  check_timestamp: timestamptz('check_timestamp').defaultNow(),
  check_duration_ms: integer('check_duration_ms'),
  check_passed: boolean('check_passed').notNull(),
  total_blocks: integer('total_blocks'),
  total_transactions: integer('total_transactions'),
  issues_found: text('issues_found').array(),
  error_message: text('error_message'),
  chain_valid: boolean('chain_valid')
}, (table) => {
  return {
    timestampIdx: index('idx_health_timestamp').on(table.check_timestamp)
  };
});
// Blockchain metrics
export const blockchain_metrics = pgTable('blockchain_metrics', {
  metric_id: serial('metric_id').primaryKey(),
  metric_timestamp: timestamptz('metric_timestamp').defaultNow(),
  metric_type: varchar('metric_type', { length: 50 }).notNull(),
  metric_value: numeric('metric_value'),
  metadata: jsonb('metadata')
}, (table) => {
  return {
    typeTimestampIdx: index('idx_metrics_type_time').on(table.metric_type, table.metric_timestamp)
  };
});