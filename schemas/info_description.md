Use this guide to enable, configure, and manage Impinj Gen2X features on Zebra fixed RFID readers using both MQTT and REST APIs. These features are currently supported on the **FXR90** with Firmware 4.0.8 and above, with additional fixed reader support coming soon.

## Overview

This reference explains how to use Gen2X operations across MQTT and REST for:

- **Protected Mode**: Lock individual tags with a password so they are invisible to unauthorized readers. 
- **FastID**: Return the EPC and TID in a single inventory response. 
- **TagFocus**: Reduce repeated reports from already-read tags so the reader prioritizes new tags. 
- **Tag Quieting**: Quiet specific tags by EPC ID through reader-level configuration. 

Impinj Gen2X extends Gen2 radio and logical layers. Tags must support Gen2X to use these features. For tag compatibility, refer to [Impinj Gen2X specifications](http://www.impinj.com/Gen2X).

## Protocols

This documentation covers both interfaces for the same Gen2X feature set:

- MQTT: Command-based operations for cloud-connected workflows.
- REST: HTTPS endpoints for direct API integration.

Use either interface based on your deployment and integration architecture.

## Before You Begin

- Set up your MQTT connection, broker, and topic before using this API. For setup instructions, see the [Zebra IoTC MQTT Setup Guide](https://zebradevs.github.io/rfid-ziotc-docs/other_cloud_support/MQTT/index.html).
- For REST API integration and setup instructions, see the following guide: [Zebra IoTC HTTP POST Integration Guide](https://zebradevs.github.io/rfid-ziotc-docs/other_cloud_support/HTTP_POST/index.html)

## Getting Started with REST API

### Authentication

1. Send `PUT /cloud/localRestLogin`.
2. Extract the access token from the login response.
3. Add the token to all protected requests.

### Configuration Workflow

Use this sequence to safely stage and apply Gen2X updates:

1. Send `GET /cloud/impinjGen2X` to check current Gen2X configuration.
2. Send `PUT /cloud/stop` to stop the IoT cloud service if it is running.
3. Send `PUT /cloud/impinjGen2X` to stage one or more feature updates.
4. Send `GET /cloud/impinjGen2X` to verify staged configuration.
5. Send `PUT /cloud/start` with `applyImpinjGen2X: true` to start the service and apply staged configuration.

## Getting Started with MQTT

Use this sequence for the same workflow through MQTT commands:

1. Send `get_impinjGen2X` to check current Gen2X configuration.
2. Send `stop` to stop the IoT cloud service if it is running.
3. Send `set_impinjGen2X` to stage one or more feature updates.
4. Send `get_impinjGen2X` to verify staged configuration.
5. Send `start` with `applyImpinjGen2X: true` to start the service and apply staged configuration.

## Feature Scope and Behavior

Gen2X supports four features:
- **Protected Mode** (tag-scoped)
- **TagFocus** (reader-scoped)
- **FastID** (reader-scoped)
- **Tag Quieting** (reader-scoped)

### Feature Scope

- **Tag-Scoped** - Protected Mode applies to specific tags identified by EPC. It operates independently of reader-scoped features, so you can protect or unprotect individual tags while any reader-scoped feature remains active.

- **Reader-Scoped** - FastID, TagFocus, and Tag Quieting apply at the reader level. These features are mutually exclusive, so only one reader-scoped feature can be active at a time. Enabling a different reader-scoped feature replaces the currently active one for subsequent inventory operations.

### Feature Persistence

The reader retains the last configured Gen2X feature and automatically restores it upon start with `applyImpinjGen2X: true`. This behavior is maintained across the following scenarios:

- Stopping and restarting the reader
- Disconnecting and reconnecting MQTT
- Rebooting the device
