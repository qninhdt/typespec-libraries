/**
 * File-vault example schema for a real personal file management platform.
 *
 * Each subdirectory represents a service boundary. Tables model each service's
 * own database. Data models represent service DTOs and gRPC messages. Service
 * files apply independent protobuf packages, so the upstream protobuf emitter
 * produces one proto module per service instead of one monolithic file.
 */
import "./shared/mixins.tsp";
import "./shared/data.tsp";
import "./identity/tables.tsp";
import "./identity/data.tsp";
import "./identity/service.tsp";
import "./metadata/tables.tsp";
import "./metadata/data.tsp";
import "./metadata/service.tsp";
import "./storage/tables.tsp";
import "./storage/data.tsp";
import "./storage/service.tsp";
import "./sharing/tables.tsp";
import "./sharing/data.tsp";
import "./sharing/service.tsp";
import "./processing/tables.tsp";
import "./processing/data.tsp";
import "./processing/service.tsp";
import "./search/tables.tsp";
import "./search/data.tsp";
import "./search/service.tsp";
import "./assistant/tables.tsp";
import "./assistant/data.tsp";
import "./assistant/service.tsp";
import "./notifications/tables.tsp";
import "./notifications/data.tsp";
import "./notifications/service.tsp";
import "./audit/tables.tsp";
import "./audit/data.tsp";
import "./audit/service.tsp";
