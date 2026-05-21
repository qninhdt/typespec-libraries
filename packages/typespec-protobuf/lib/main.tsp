import "./tsp-index.js";

using TypeSpec.Reflection;

namespace Qninhdt.Proto;

/**
 * Stream modes for gRPC operations.
 */
enum StreamMode {
  In,
  Out,
  Duplex,
}

/**
 * Sets the proto package name for a namespace.
 * All messages and services in this namespace will be emitted under this package.
 */
extern dec protoPackage(target: Namespace, name: valueof string);

/**
 * Marks an interface as a gRPC service definition.
 */
extern dec protoService(target: Interface);

/**
 * Marks an operation as a streaming RPC.
 */
extern dec stream(target: Operation, mode: StreamMode);

/**
 * Overrides the auto-assigned field number for a message field.
 * By default, fields are numbered sequentially by declaration order.
 */
extern dec protoField(target: ModelProperty, number: valueof int32);

/**
 * Adds an explicit import of an external proto file to the generated output.
 */
extern dec protoImport(target: Namespace, path: valueof string);

/**
 * Maps a model to a well-known proto message type, preventing it from being
 * emitted as a standalone message definition.
 */
extern dec protoMap(target: Model, protoType: valueof string);
