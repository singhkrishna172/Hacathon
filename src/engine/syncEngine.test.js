
import {
    detectConflict,
    resolveConflict,
} from "./syncEngine.js";

const operationA = {
    opId: "A-1",
    taskId: "task-1",
    field: "title",
    baseVersion: 1,
    value: "Prepare project presentation",
};

const operationB = {
    opId: "B-1",
    taskId: "task-1",
    field: "title",
    baseVersion: 1,
    value: "Prepare hackathon presentation",
};

console.log(
    "Same task and same base version:",
    detectConflict(operationA, operationB)
);

console.log(
    "Same operation:",
    detectConflict(operationA, operationA)
);

const result = resolveConflict(
    {
        opId: "A-1",
        clientId: "client-A",
        taskId: "task-1",
        field: "title",
        baseVersion: 1,
        counter: 2,
        value: "Prepare project presentation",
    },
    {
        opId: "B-1",
        clientId: "client-B",
        taskId: "task-1",
        field: "title",
        baseVersion: 1,
        counter: 3,
        value: "Prepare hackathon presentation",
    }
);

console.log("Winner:", result.winner.value);
console.log("Preserved losing value:", result.conflict.losingValue);