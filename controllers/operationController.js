const pool = require('../config/database');
const SocketService = require('../services/socketService');

const OperationController = {
    // ✅ API 1: Get available staff & equipment for date/time
    getAvailableResources: async (req, res) => {
        const { scheduled_date, scheduled_start, duration_minutes } = req.query;
        
        try {
            console.log('🔍 Fetching available resources for:', scheduled_date, scheduled_start, duration_minutes);

            if (!scheduled_date || !scheduled_start || !duration_minutes) {
                return res.status(400).json({
                    success: false,
                    error: 'scheduled_date, scheduled_start, and duration_minutes are required'
                });
            }

            // Convert to proper datetime format
            const scheduledDateTime = scheduled_date + ' ' + scheduled_start.split('T')[1].split('.')[0];

            // Get available staff (not busy during this time)
            const [availableStaff] = await pool.execute(`
                SELECT 
                    s.staff_id,
                    s.user_id,
                    u.username,
                    u.email,
                    s.specialization
                FROM staff s
                JOIN users u ON s.user_id = u.user_id
                WHERE s.staff_id NOT IN (
                    SELECT os.staff_id 
                    FROM operation_schedule os
                    JOIN operations o ON os.operation_id = o.operation_id
                    WHERE o.status = 'Scheduled'
                    AND os.staff_id IS NOT NULL
                    AND o.scheduled_date = ?
                    AND (
                        (o.scheduled_start < DATE_ADD(?, INTERVAL ? MINUTE) 
                        AND DATE_ADD(o.scheduled_start, INTERVAL o.duration_minutes MINUTE) > ?)
                    )
                )
                ORDER BY u.username
            `, [scheduled_date, scheduledDateTime, duration_minutes, scheduledDateTime]);

            // Get available equipment (not busy and status = Available)
            const [availableEquipment] = await pool.execute(`
                SELECT 
                    e.equipment_id,
                    e.equipment_name,
                    e.availability_status
                FROM equipment e
                WHERE e.availability_status = 'Available'
                AND e.equipment_id NOT IN (
                    SELECT os.equipment_id 
                    FROM operation_schedule os
                    JOIN operations o ON os.operation_id = o.operation_id
                    WHERE o.status = 'Scheduled'
                    AND os.equipment_id IS NOT NULL
                    AND o.scheduled_date = ?
                    AND (
                        (o.scheduled_start < DATE_ADD(?, INTERVAL ? MINUTE) 
                        AND DATE_ADD(o.scheduled_start, INTERVAL o.duration_minutes MINUTE) > ?)
                    )
                )
                ORDER BY e.equipment_name
            `, [scheduled_date, scheduledDateTime, duration_minutes, scheduledDateTime]);

            res.json({
                success: true,
                data: {
                    available_staff: availableStaff,
                    available_equipment: availableEquipment,
                    staff_count: availableStaff.length,
                    equipment_count: availableEquipment.length,
                    time_slot: {
                        date: scheduled_date,
                        start_time: scheduled_start,
                        duration_minutes: parseInt(duration_minutes)
                    }
                }
            });

        } catch (error) {
            console.error('Error fetching available resources:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch available resources: ' + error.message 
            });
        }
    },

    // ✅ API 2: Schedule operation with REAL-TIME UPDATES
    scheduleOperation: async (req, res) => {
        const {
            operation_name,
            description,
            scheduled_date,
            scheduled_start,
            duration_minutes,
            room_id,
            staff_ids = [],
            equipment_ids = []
        } = req.body;

        const scheduler_id = req.user.user_id;

        try {
            console.log('🏥 Scheduling Operation:', operation_name);
            console.log('Staff IDs:', staff_ids);
            console.log('Equipment IDs:', equipment_ids);

            // Validate required fields
            if (!operation_name || !scheduled_date || !scheduled_start || !duration_minutes || !room_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Required: operation_name, scheduled_date, scheduled_start, duration_minutes, room_id'
                });
            }

            // ✅ SIMPLE FIX: Direct datetime construction
            let sqlDateTime;
            
            if (scheduled_start.includes(' ') && scheduled_start.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)) {
                sqlDateTime = scheduled_start;
            } else if (scheduled_date && scheduled_start) {
                const cleanTime = scheduled_start.split('T')[1]?.split('.')[0] || scheduled_start.split(' ')[1] || scheduled_start;
                sqlDateTime = `${scheduled_date} ${cleanTime}`;
            } else {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid date/time format.'
                });
            }

            console.log('Formatted SQL DateTime:', sqlDateTime);

            // Date validation
            const scheduledDate = new Date(sqlDateTime);
            const now = new Date();
            
            if (isNaN(scheduledDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid date/time value provided'
                });
            }

            if (scheduledDate < now) {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot schedule operations in the past.'
                });
            }

            // Check room exists and is active
            const [rooms] = await pool.execute(
                'SELECT room_id, room_name FROM ot_rooms WHERE room_id = ? AND is_active = TRUE',
                [room_id]
            );

            if (rooms.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'OT Room not found or inactive'
                });
            }

            // Check room time conflict
            const [conflictingOps] = await pool.execute(`
                SELECT operation_name 
                FROM operations 
                WHERE room_id = ? 
                AND status = 'Scheduled'
                AND scheduled_date = ?
                AND (
                    (scheduled_start < DATE_ADD(?, INTERVAL ? MINUTE) 
                    AND DATE_ADD(scheduled_start, INTERVAL duration_minutes MINUTE) > ?)
                )
            `, [room_id, scheduled_date, sqlDateTime, duration_minutes, sqlDateTime]);

            if (conflictingOps.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: `Room not available. Conflicts with "${conflictingOps[0].operation_name}"`
                });
            }

            // Start transaction
            const connection = await pool.getConnection();
            await connection.beginTransaction();

            try {
                // 1. CREATE OPERATION
                const [operationResult] = await connection.execute(
                    `INSERT INTO operations 
                    (operation_name, description, scheduled_date, scheduled_start, duration_minutes, room_id, scheduler_id, status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [operation_name, description, scheduled_date, sqlDateTime, duration_minutes, room_id, scheduler_id, 'Scheduled']
                );

                const operation_id = operationResult.insertId;
                console.log('✅ Operation created:', operation_id);

                const assignmentResults = {
                    staff_assigned: [],
                    equipment_assigned: [],
                    staff_failed: [],
                    equipment_failed: []
                };

                // ✅ COMBINED ASSIGNMENT LOGIC
                const assignedEquipment = new Set();

                // Assign staff with equipment
                for (const staff_id of staff_ids) {
                    try {
                        // Verify staff availability
                        const [busyStaff] = await connection.execute(`
                            SELECT os.staff_id 
                            FROM operation_schedule os
                            JOIN operations o ON os.operation_id = o.operation_id
                            WHERE os.staff_id = ?
                            AND o.status = 'Scheduled'
                            AND o.scheduled_date = ?
                            AND (
                                (o.scheduled_start < DATE_ADD(?, INTERVAL ? MINUTE) 
                                AND DATE_ADD(o.scheduled_start, INTERVAL o.duration_minutes MINUTE) > ?)
                            )
                        `, [staff_id, scheduled_date, sqlDateTime, duration_minutes, sqlDateTime]);

                        if (busyStaff.length === 0) {
                            // Find available equipment for this staff
                            let equipment_id_to_assign = null;
                            
                            for (const equipment_id of equipment_ids) {
                                if (!assignedEquipment.has(equipment_id)) {
                                    // Check equipment availability
                                    const [busyEquipment] = await connection.execute(`
                                        SELECT os.equipment_id 
                                        FROM operation_schedule os
                                        JOIN operations o ON os.operation_id = o.operation_id
                                        WHERE os.equipment_id = ?
                                        AND o.status = 'Scheduled'
                                        AND o.scheduled_date = ?
                                        AND (
                                            (o.scheduled_start < DATE_ADD(?, INTERVAL ? MINUTE) 
                                            AND DATE_ADD(o.scheduled_start, INTERVAL o.duration_minutes MINUTE) > ?)
                                        )
                                    `, [equipment_id, scheduled_date, sqlDateTime, duration_minutes, sqlDateTime]);

                                    if (busyEquipment.length === 0) {
                                        equipment_id_to_assign = equipment_id;
                                        assignedEquipment.add(equipment_id);
                                        break;
                                    }
                                }
                            }

                            // ✅ CREATE COMBINED RECORD
                            await connection.execute(
                                `INSERT INTO operation_schedule 
                                (operation_id, staff_id, equipment_id, assigned_by, assigned_at, notified) 
                                VALUES (?, ?, ?, ?, NOW(), 0)`,
                                [operation_id, staff_id, equipment_id_to_assign, scheduler_id]
                            );

                            assignmentResults.staff_assigned.push(staff_id);
                            
                            if (equipment_id_to_assign) {
                                await connection.execute(
                                    'UPDATE equipment SET availability_status = "In Use" WHERE equipment_id = ?',
                                    [equipment_id_to_assign]
                                );
                                assignmentResults.equipment_assigned.push(equipment_id_to_assign);
                            }
                        } else {
                            assignmentResults.staff_failed.push({staff_id, reason: 'No longer available'});
                        }
                    } catch (error) {
                        assignmentResults.staff_failed.push({staff_id, reason: error.message});
                    }
                }

                // Assign remaining equipment as shared
                const remainingEquipment = equipment_ids.filter(eq => !assignedEquipment.has(eq));
                
                for (const equipment_id of remainingEquipment) {
                    try {
                        const [busyEquipment] = await connection.execute(`
                            SELECT os.equipment_id 
                            FROM operation_schedule os
                            JOIN operations o ON os.operation_id = o.operation_id
                            WHERE os.equipment_id = ?
                            AND o.status = 'Scheduled'
                            AND o.scheduled_date = ?
                            AND (
                                (o.scheduled_start < DATE_ADD(?, INTERVAL ? MINUTE) 
                                AND DATE_ADD(o.scheduled_start, INTERVAL o.duration_minutes MINUTE) > ?)
                            )
                        `, [equipment_id, scheduled_date, sqlDateTime, duration_minutes, sqlDateTime]);

                        if (busyEquipment.length === 0) {
                            // ✅ EQUIPMENT-ONLY RECORD
                            await connection.execute(
                                `INSERT INTO operation_schedule 
                                (operation_id, staff_id, equipment_id, assigned_by, assigned_at, notified) 
                                VALUES (?, NULL, ?, ?, NOW(), 0)`,
                                [operation_id, equipment_id, scheduler_id]
                            );
                            
                            await connection.execute(
                                'UPDATE equipment SET availability_status = "In Use" WHERE equipment_id = ?',
                                [equipment_id]
                            );
                            
                            assignmentResults.equipment_assigned.push(equipment_id);
                        } else {
                            assignmentResults.equipment_failed.push({equipment_id, reason: 'No longer available'});
                        }
                    } catch (error) {
                        assignmentResults.equipment_failed.push({equipment_id, reason: error.message});
                    }
                }

                // Send notifications
                if (assignmentResults.staff_assigned.length > 0) {
                    for (const staff_id of assignmentResults.staff_assigned) {
                        await connection.execute(
                            `INSERT INTO staff_notifications 
                            (staff_id, operation_id, notification_text, notification_time, is_read) 
                            VALUES (?, ?, ?, NOW(), 0)`,
                            [staff_id, operation_id, `Assigned to: ${operation_name} on ${scheduled_date}`]
                        );
                    }
                }

                await connection.commit();

                // ✅ REAL-TIME UPDATES AFTER SUCCESSFUL SCHEDULING
                if (req.app.get('io')) {
                    const io = req.app.get('io');
                    const socketService = new SocketService(io);
                    
                    // Get full operation details for real-time notification
                    const [operation] = await pool.execute(`
                        SELECT o.*, r.room_name, u.username as scheduler_name
                        FROM operations o 
                        LEFT JOIN ot_rooms r ON o.room_id = r.room_id 
                        LEFT JOIN users u ON o.scheduler_id = u.user_id 
                        WHERE o.operation_id = ?
                    `, [operation_id]);

                    const operationData = operation[0];

                    // Notify about new operation
                    socketService.notifyOperationUpdate('scheduled', operationData);

                    // Notify assigned staff
                    if (assignmentResults.staff_assigned.length > 0) {
                        socketService.notifyStaffAssignment(assignmentResults.staff_assigned, operationData);
                    }

                    // Notify equipment status changes
                    assignmentResults.equipment_assigned.forEach(equipment_id => {
                        socketService.notifyEquipmentUpdate(equipment_id, 'In Use');
                    });

                    console.log('📢 Real-time notifications sent for new operation');
                }

                // Get final operation details for response
                const [operation] = await pool.execute(`
                    SELECT o.*, r.room_name, u.username as scheduler_name
                    FROM operations o 
                    LEFT JOIN ot_rooms r ON o.room_id = r.room_id 
                    LEFT JOIN users u ON o.scheduler_id = u.user_id 
                    WHERE o.operation_id = ?
                `, [operation_id]);

                res.status(201).json({
                    success: true,
                    message: 'Operation scheduled successfully',
                    data: {
                        operation: operation[0],
                        assignments: assignmentResults
                    }
                });

            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }

        } catch (error) {
            console.error('Error scheduling operation:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to schedule operation: ' + error.message 
            });
        }
    },

    // ✅ API 3: Get all operations with assignments
    getAllOperations: async (req, res) => {
        try {
            const [operations] = await pool.execute(`
                SELECT 
                    o.*, 
                    r.room_name, 
                    u.username as scheduler_name,
                    (SELECT COUNT(*) FROM operation_schedule WHERE operation_id = o.operation_id AND staff_id IS NOT NULL) as staff_count,
                    (SELECT COUNT(*) FROM operation_schedule WHERE operation_id = o.operation_id AND equipment_id IS NOT NULL) as equipment_count
                FROM operations o 
                LEFT JOIN ot_rooms r ON o.room_id = r.room_id 
                LEFT JOIN users u ON o.scheduler_id = u.user_id 
                ORDER BY o.scheduled_date DESC, o.scheduled_start DESC
            `);

            res.json({
                success: true,
                data: operations,
                count: operations.length
            });
        } catch (error) {
            console.error('Error fetching operations:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch operations' 
            });
        }
    },

    // ✅ Staff Daily Schedule
    getStaffDailySchedule: async (req, res) => {
        try {
            console.log('📅 Fetching staff daily schedule...');
            
            const staff_id = 2;
            
            const { date } = req.query;
            
            let targetDate;
            if (date) {
                targetDate = date;
            } else {
                const now = new Date();
                targetDate = now.toISOString().split('T')[0];
            }
            
            console.log(`📋 Fetching schedule for staff ${staff_id} on ${targetDate}`);

            const [assignments] = await pool.execute(`
                SELECT 
                    o.operation_id,
                    o.operation_name,
                    o.description,
                    o.scheduled_date,
                    DATE_FORMAT(o.scheduled_start, '%Y-%m-%d %H:%i:%s') as scheduled_start,
                    o.duration_minutes,
                    o.status,
                    r.room_name,
                    r.room_id,
                    u.username as scheduler_name,
                    TIMESTAMPDIFF(MINUTE, NOW(), o.scheduled_start) as minutes_until_start,
                    CASE 
                        WHEN NOW() < o.scheduled_start THEN 'Upcoming'
                        WHEN NOW() BETWEEN o.scheduled_start AND DATE_ADD(o.scheduled_start, INTERVAL o.duration_minutes MINUTE) THEN 'In Progress'
                        ELSE 'Completed'
                    END as operation_status,
                    CASE 
                        WHEN NOW() < o.scheduled_start THEN TIMESTAMPDIFF(MINUTE, NOW(), o.scheduled_start)
                        ELSE NULL
                    END as minutes_until_start_display
                FROM operations o
                JOIN operation_schedule os ON o.operation_id = os.operation_id
                JOIN ot_rooms r ON o.room_id = r.room_id
                JOIN users u ON o.scheduler_id = u.user_id
                WHERE os.staff_id = ? AND o.scheduled_date = ?
                ORDER BY o.scheduled_start ASC
            `, [staff_id, targetDate]);

            // Get equipment and team details
            const assignmentsWithEquipment = await Promise.all(
                assignments.map(async (assignment) => {
                    const [equipment] = await pool.execute(`
                        SELECT DISTINCT
                            e.equipment_id,
                            e.equipment_name,
                            e.availability_status
                        FROM operation_schedule os
                        JOIN equipment e ON os.equipment_id = e.equipment_id
                        WHERE os.operation_id = ? AND os.equipment_id IS NOT NULL
                    `, [assignment.operation_id]);

                    const [teamMembers] = await pool.execute(`
                        SELECT DISTINCT
                            s.staff_id,
                            u.username,
                            u.email,
                            s.specialization
                        FROM operation_schedule os
                        JOIN staff s ON os.staff_id = s.staff_id
                        JOIN users u ON s.user_id = u.user_id
                        WHERE os.operation_id = ? AND os.staff_id != ?
                    `, [assignment.operation_id, staff_id]);

                    return {
                        ...assignment,
                        equipment: equipment,
                        team_members: teamMembers,
                        equipment_count: equipment.length,
                        team_count: teamMembers.length + 1
                    };
                })
            );

            // Calculate summary
            const totalDuration = assignmentsWithEquipment.reduce((sum, op) => sum + op.duration_minutes, 0);
            const uniqueRooms = [...new Set(assignmentsWithEquipment.map(op => op.room_name))];
            
            const statusCounts = assignmentsWithEquipment.reduce((acc, op) => {
                acc[op.operation_status] = (acc[op.operation_status] || 0) + 1;
                return acc;
            }, {});

            console.log(`✅ Found ${assignmentsWithEquipment.length} assignments`);

            res.json({
                success: true,
                data: {
                    date: targetDate,
                    staff_id: staff_id,
                    assignments: assignmentsWithEquipment,
                    summary: {
                        total_operations: assignmentsWithEquipment.length,
                        total_duration_minutes: totalDuration,
                        total_duration_hours: Math.round(totalDuration / 60 * 100) / 100,
                        rooms: uniqueRooms,
                        equipment_count: assignmentsWithEquipment.reduce((sum, op) => sum + op.equipment_count, 0),
                        team_members_count: assignmentsWithEquipment.reduce((sum, op) => sum + op.team_count, 0),
                        status_breakdown: statusCounts
                    },
                    assignment_count: assignmentsWithEquipment.length,
                    message: assignmentsWithEquipment.length === 0 ? 
                        `No operations scheduled for ${targetDate}` : 
                        `Found ${assignmentsWithEquipment.length} operation(s) for ${targetDate}`
                }
            });

        } catch (error) {
            console.error('❌ Error fetching staff daily schedule:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch daily schedule: ' + error.message 
            });
        }
    },

    // ✅ Weekly Assignment Counts
    getWeeklyAssignmentCounts: async (req, res) => {
        try {
            const { week_start } = req.query;
            
            const startDate = week_start ? new Date(week_start) : new Date();
            startDate.setDate(startDate.getDate() - startDate.getDay());
            
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 6);
            
            const startDateStr = startDate.toISOString().split('T')[0];
            const endDateStr = endDate.toISOString().split('T')[0];

            console.log(`📊 Weekly assignments from ${startDateStr} to ${endDateStr}`);

            const [assignmentCounts] = await pool.execute(`
                SELECT 
                    s.staff_id,
                    u.username,
                    u.email,
                    s.specialization,
                    COUNT(DISTINCT os.operation_id) as operation_count,
                    COALESCE(SUM(o.duration_minutes), 0) as total_minutes,
                    GROUP_CONCAT(DISTINCT o.operation_name) as operations,
                    (
                        SELECT COUNT(DISTINCT o2.operation_id)
                        FROM operations o2
                        JOIN operation_schedule os2 ON o2.operation_id = os2.operation_id
                        WHERE os2.staff_id = s.staff_id 
                        AND o2.scheduled_date BETWEEN ? AND ?
                        AND o2.status = 'Scheduled'
                    ) as week_operation_count
                FROM staff s
                JOIN users u ON s.user_id = u.user_id
                LEFT JOIN operation_schedule os ON s.staff_id = os.staff_id
                LEFT JOIN operations o ON os.operation_id = o.operation_id 
                    AND o.scheduled_date BETWEEN ? AND ?
                    AND o.status = 'Scheduled'
                GROUP BY s.staff_id, u.username, u.email, s.specialization
                ORDER BY operation_count DESC, total_minutes DESC
            `, [startDateStr, endDateStr, startDateStr, endDateStr]);

            const [weekOperations] = await pool.execute(`
                SELECT COUNT(DISTINCT operation_id) as total_week_operations
                FROM operations 
                WHERE scheduled_date BETWEEN ? AND ? 
                AND status = 'Scheduled'
            `, [startDateStr, endDateStr]);

            const week_operation_count = weekOperations[0]?.total_week_operations || 0;

            const totalOperations = assignmentCounts.reduce((sum, staff) => sum + staff.operation_count, 0);
            const totalMinutes = assignmentCounts.reduce((sum, staff) => sum + parseInt(staff.total_minutes || 0), 0);
            
            const avg_operations_per_staff = assignmentCounts.length > 0 ? 
                (totalOperations / assignmentCounts.length).toFixed(2) : 0;

            res.json({
                success: true,
                data: {
                    week_start: startDateStr,
                    week_end: endDateStr,
                    week_operation_count: week_operation_count,
                    assignment_counts: assignmentCounts,
                    summary: {
                        total_staff: assignmentCounts.length,
                        total_operations: totalOperations,
                        total_minutes: totalMinutes,
                        total_hours: Math.round(totalMinutes / 60 * 100) / 100,
                        avg_operations_per_staff: avg_operations_per_staff,
                        workload_distribution: {
                            over_assigned: assignmentCounts.filter(staff => staff.operation_count > avg_operations_per_staff).length,
                            under_assigned: assignmentCounts.filter(staff => staff.operation_count < avg_operations_per_staff).length,
                            balanced: assignmentCounts.filter(staff => staff.operation_count == Math.round(avg_operations_per_staff)).length
                        }
                    }
                }
            });

        } catch (error) {
            console.error('Error fetching weekly assignment counts:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch weekly assignment counts: ' + error.message 
            });
        }
    },

    // ✅ Public Schedule (No authentication required)
    getPublicSchedule: async (req, res) => {
        try {
            const { date, room_id } = req.query;
            
            console.log('📅 Fetching public schedule:', { date, room_id });

            let query = `
                SELECT 
                    o.operation_id,
                    o.operation_name,
                    o.description,
                    o.scheduled_date,
                    DATE_FORMAT(o.scheduled_start, '%Y-%m-%d %H:%i:%s') as scheduled_start,
                    o.duration_minutes,
                    r.room_name,
                    r.room_id
                FROM operations o
                JOIN ot_rooms r ON o.room_id = r.room_id
                WHERE o.status = 'Scheduled'
                AND r.is_active = TRUE
            `;
            
            // Handle filters
            if (date && room_id) {
                query += ' AND o.scheduled_date = ? AND o.room_id = ?';
                const [operations] = await pool.execute(query, [date, parseInt(room_id)]);
                return res.json({ success: true, data: { operations, filters: { date, room_id } } });
            }
            else if (date) {
                query += ' AND o.scheduled_date = ?';
                const [operations] = await pool.execute(query, [date]);
                return res.json({ success: true, data: { operations, filters: { date, room_id: 'all' } } });
            }
            else if (room_id) {
                query += ' AND o.room_id = ?';
                const [operations] = await pool.execute(query, [parseInt(room_id)]);
                return res.json({ success: true, data: { operations, filters: { date: 'all', room_id } } });
            }
            else {
                const [operations] = await pool.execute(query);
                return res.json({ 
                    success: true, 
                    data: { 
                        operations, 
                        filters: { date: 'all', room_id: 'all' } 
                    } 
                });
            }

        } catch (error) {
            console.error('Error fetching public schedule:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch public schedule: ' + error.message 
            });
        }
    }
};

module.exports = OperationController;