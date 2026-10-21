#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/2f424e284df3a8e398ab57baabfcf8960a9269674eec5a6576602a55ef6fd7fd/contract';
import endContract from '../../snapshots/2f424e284df3a8e398ab57baabfcf8960a9269674eec5a6576602a55ef6fd7fd/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/5684a7bbeb3d1a19de744f5702d0ec836e246d1ad48ab7ea85d336c0c7625827/contract';
import startContract from '../../snapshots/5684a7bbeb3d1a19de744f5702d0ec836e246d1ad48ab7ea85d336c0c7625827/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'incident',
        columns: [
          col('bus_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('company_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('detected_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('journey_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('latitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('longitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('resolved_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('route_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('severity', 'text', {
            notNull: true,
            default: lit('MEDIUM'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('OPEN'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'incident_severity_check_5e5a5e80',
            "\"severity\" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')",
          ),
          checkExpression(
            'incident_status_check_ba3a9c90',
            "\"status\" IN ('OPEN', 'DISPATCHED', 'IN_PROGRESS', 'RESOLVED', 'FALSE_ALARM')",
          ),
          checkExpression(
            'incident_type_check_c6f17e7c',
            "\"type\" IN ('UNANTICIPATED_STOP', 'ROUTE_DEVIATION', 'ACCIDENT', 'BREAKDOWN', 'KIDNAPPING', 'DRIVER_SOS')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'incidentDispatch',
        columns: [
          col('accepted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('arrived_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('dispatched_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('incident_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('notes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('resolved_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('responder_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('responder_location_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'incidentDispatch_status_check_8fd88ccf',
            "\"status\" IN ('PENDING', 'ACCEPTED', 'EN_ROUTE', 'ON_SCENE', 'COMPLETED', 'DECLINED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'journey',
        columns: [
          col('bus_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('company_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('ended_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('route_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('session_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('started_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('SCHEDULED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'journey_status_check_c6f373de',
            "\"status\" IN ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'responderLocation',
        columns: [
          col('branch_name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('is_active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('latitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('longitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('responder_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'route',
        columns: [
          col('company_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('is_active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('polyline', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('route_code', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'routeStop',
        columns: [
          col('route_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('stop_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('stop_order', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['route_id', 'stop_id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'stop',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('latitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('longitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('radius_meters', 'int4', {
            notNull: true,
            default: lit(100),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'incidentDispatch',
        constraint: 'incidentDispatch_incident_id_responder_id_key',
        columns: ['incident_id', 'responder_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'responderLocation',
        constraint: 'responderLocation_responder_id_branch_name_key',
        columns: ['responder_id', 'branch_name'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'route',
        constraint: 'route_company_id_route_code_key',
        columns: ['company_id', 'route_code'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'routeStop',
        constraint: 'routeStop_route_id_stop_order_key',
        columns: ['route_id', 'stop_order'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'incident',
        index: 'incident_bus_id_detected_at_idx_79d59898',
        columns: ['bus_id', 'detected_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'incident',
        index: 'incident_bus_id_idx_6cc9a53f',
        columns: ['bus_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'incident',
        index: 'incident_company_id_idx_1303a718',
        columns: ['company_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'incident',
        index: 'incident_company_id_status_detected_at_idx_d1f097bb',
        columns: ['company_id', 'status', 'detected_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'incident',
        index: 'incident_journey_id_idx_2c4ae44f',
        columns: ['journey_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'incident',
        index: 'incident_route_id_idx_c251327f',
        columns: ['route_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'incident',
        index: 'incident_type_status_idx_f045f361',
        columns: ['type', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'incidentDispatch',
        index: 'incidentDispatch_incident_id_idx_4eb9ca99',
        columns: ['incident_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'incidentDispatch',
        index: 'incidentDispatch_incident_id_status_idx_7e3e5b70',
        columns: ['incident_id', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'incidentDispatch',
        index: 'incidentDispatch_responder_id_idx_660913e7',
        columns: ['responder_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'incidentDispatch',
        index: 'incidentDispatch_responder_id_status_idx_fc5dbd58',
        columns: ['responder_id', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'incidentDispatch',
        index: 'incidentDispatch_responder_location_id_idx_7f4fc5bd',
        columns: ['responder_location_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'journey',
        index: 'journey_bus_id_idx_6cc9a53f',
        columns: ['bus_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'journey',
        index: 'journey_bus_id_status_idx_d1c1a79f',
        columns: ['bus_id', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'journey',
        index: 'journey_company_id_idx_1303a718',
        columns: ['company_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'journey',
        index: 'journey_company_id_status_idx_e3e50399',
        columns: ['company_id', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'journey',
        index: 'journey_route_id_idx_c251327f',
        columns: ['route_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'journey',
        index: 'journey_route_id_status_idx_3ee8ce07',
        columns: ['route_id', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'journey',
        index: 'journey_session_id_idx_00ba47bf',
        columns: ['session_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'responderLocation',
        index: 'responderLocation_latitude_longitude_idx_cf6c2b2c',
        columns: ['latitude', 'longitude'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'responderLocation',
        index: 'responderLocation_responder_id_idx_660913e7',
        columns: ['responder_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'responderLocation',
        index: 'responderLocation_responder_id_is_active_idx_b308419e',
        columns: ['responder_id', 'is_active'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'route',
        index: 'route_company_id_idx_1303a718',
        columns: ['company_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'route',
        index: 'route_company_id_is_active_idx_5040a192',
        columns: ['company_id', 'is_active'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'routeStop',
        index: 'routeStop_route_id_idx_c251327f',
        columns: ['route_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'routeStop',
        index: 'routeStop_stop_id_idx_8f425461',
        columns: ['stop_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'incident',
        foreignKey: {
          name: 'incident_company_id_fkey',
          columns: ['company_id'],
          references: { schema: 'public', table: 'company', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'incident',
        foreignKey: {
          name: 'incident_bus_id_fkey',
          columns: ['bus_id'],
          references: { schema: 'public', table: 'bus', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'incident',
        foreignKey: {
          name: 'incident_route_id_fkey',
          columns: ['route_id'],
          references: { schema: 'public', table: 'route', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'incident',
        foreignKey: {
          name: 'incident_journey_id_fkey',
          columns: ['journey_id'],
          references: { schema: 'public', table: 'journey', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'incidentDispatch',
        foreignKey: {
          name: 'incidentDispatch_incident_id_fkey',
          columns: ['incident_id'],
          references: { schema: 'public', table: 'incident', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'incidentDispatch',
        foreignKey: {
          name: 'incidentDispatch_responder_id_fkey',
          columns: ['responder_id'],
          references: { schema: 'public', table: 'emergencyResponders', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'incidentDispatch',
        foreignKey: {
          name: 'incidentDispatch_responder_location_id_fkey',
          columns: ['responder_location_id'],
          references: { schema: 'public', table: 'responderLocation', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'journey',
        foreignKey: {
          name: 'journey_company_id_fkey',
          columns: ['company_id'],
          references: { schema: 'public', table: 'company', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'journey',
        foreignKey: {
          name: 'journey_bus_id_fkey',
          columns: ['bus_id'],
          references: { schema: 'public', table: 'bus', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'journey',
        foreignKey: {
          name: 'journey_route_id_fkey',
          columns: ['route_id'],
          references: { schema: 'public', table: 'route', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'journey',
        foreignKey: {
          name: 'journey_session_id_fkey',
          columns: ['session_id'],
          references: { schema: 'public', table: 'driverSession', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'responderLocation',
        foreignKey: {
          name: 'responderLocation_responder_id_fkey',
          columns: ['responder_id'],
          references: { schema: 'public', table: 'emergencyResponders', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'route',
        foreignKey: {
          name: 'route_company_id_fkey',
          columns: ['company_id'],
          references: { schema: 'public', table: 'company', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'routeStop',
        foreignKey: {
          name: 'routeStop_route_id_fkey',
          columns: ['route_id'],
          references: { schema: 'public', table: 'route', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'routeStop',
        foreignKey: {
          name: 'routeStop_stop_id_fkey',
          columns: ['stop_id'],
          references: { schema: 'public', table: 'stop', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
