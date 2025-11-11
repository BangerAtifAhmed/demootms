const pool = require('../config/database');

class SocketService {
    constructor(io) {
        this.io = io;
    }

    // ✅ Notify all clients about OT room changes
    notifyRoomUpdate(action, roomData) {
        this.io.to('room-updates').emit('room-updated', {
            action: action, // 'added', 'updated', 'deleted'
            room: roomData,
            timestamp: new Date().toISOString()
        });
        console.log(`📢 Room ${action}: ${roomData.room_name}`);
    }

    // ✅ Notify all clients about operation changes
    notifyOperationUpdate(action, operationData) {
        this.io.to('operation-updates').emit('operation-updated', {
            action: action, // 'scheduled', 'updated', 'cancelled', 'completed'
            operation: operationData,
            timestamp: new Date().toISOString()
        });
        console.log(`📢 Operation ${action}: ${operationData.operation_name}`);
    }

    // ✅ Notify staff about new assignments
    notifyStaffAssignment(staffIds, operationData) {
        staffIds.forEach(staffId => {
            this.io.emit(`staff-${staffId}-assignments`, {
                type: 'new_assignment',
                operation: operationData,
                message: `You have been assigned to: ${operationData.operation_name}`,
                timestamp: new Date().toISOString()
            });
        });
        console.log(`📢 Notified ${staffIds.length} staff about new assignment`);
    }

    // ✅ Notify about equipment status changes
    notifyEquipmentUpdate(equipmentId, status) {
        this.io.to('operation-updates').emit('equipment-updated', {
            equipment_id: equipmentId,
            status: status,
            timestamp: new Date().toISOString()
        });
        console.log(`📢 Equipment ${equipmentId} status: ${status}`);
    }
}

module.exports = SocketService;