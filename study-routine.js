// Dummy study routine data
const studyRoutine = {
    dailySchedule: {
        monday: [
            { time: "08:00", subject: "Physics", duration: 60, type: "Theory" },
            { time: "10:00", subject: "Chemistry", duration: 45, type: "Practice" },
            { time: "14:00", subject: "Mathematics", duration: 90, type: "Problem Solving" }
        ],
        tuesday: [
            { time: "09:00", subject: "Chemistry", duration: 60, type: "Lab Work" },
            { time: "11:00", subject: "Physics", duration: 45, type: "Quiz" },
            { time: "15:00", subject: "Mathematics", duration: 60, type: "Practice" }
        ],
        wednesday: [
            { time: "08:30", subject: "Mathematics", duration: 90, type: "Theory" },
            { time: "11:00", subject: "Physics", duration: 60, type: "Practice" },
            { time: "14:30", subject: "Chemistry", duration: 45, type: "Quiz" }
        ],
        thursday: [
            { time: "09:00", subject: "Chemistry", duration: 60, type: "Theory" },
            { time: "11:30", subject: "Mathematics", duration: 90, type: "Problem Solving" },
            { time: "15:00", subject: "Physics", duration: 45, type: "Practice" }
        ],
        friday: [
            { time: "08:00", subject: "Physics", duration: 60, type: "Quiz" },
            { time: "10:30", subject: "Chemistry", duration: 45, type: "Practice" },
            { time: "14:00", subject: "Mathematics", duration: 60, type: "Theory" }
        ]
    },
    weeklyGoals: {
        physics: {
            targetHours: 10,
            completedHours: 8.5,
            topics: ["Mechanics", "Thermodynamics", "Electromagnetism"]
        },
        chemistry: {
            targetHours: 8,
            completedHours: 7,
            topics: ["Organic Chemistry", "Inorganic Chemistry", "Physical Chemistry"]
        },
        mathematics: {
            targetHours: 12,
            completedHours: 10.5,
            topics: ["Calculus", "Algebra", "Geometry"]
        }
    },
    studyStreak: {
        currentStreak: 5,
        longestStreak: 12,
        lastStudyDate: "2024-03-15",
        totalStudyDays: 45
    },
    breakSchedule: {
        shortBreak: 15, // minutes
        longBreak: 30, // minutes
        breakAfter: 45 // minutes of study
    }
};

export default studyRoutine; 