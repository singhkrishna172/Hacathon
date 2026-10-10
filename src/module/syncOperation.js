
export class SyncOperation {
    constructor({
        opId,
        roomId,
        clientId,
        taskId,
        field = "title",
        value,
        baseVersion,
        counter,
    }) {
        this.opId = opId;
        this.roomId = roomId;
        this.clientId = clientId;
        this.taskId = taskId;
        this.field = field;
        this.value = value;
        this.baseVersion = baseVersion;
        this.counter = counter;
    }

    toDatabaseRow() {
        return {
            op_id: this.opId,
            room_id: this.roomId,
            client_id: this.clientId,
            task_id: this.taskId,
            field: this.field,
            value: this.value,
            base_version: this.baseVersion,
            counter: this.counter,
        };
    }
}
