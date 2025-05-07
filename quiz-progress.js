// Dummy quiz progress data
const quizProgress = {
    overallStats: {
        totalQuizzesTaken: 15,
        averageScore: 78.5,
        totalTimeSpent: 450, // in minutes
        streakDays: 5,
        lastQuizDate: "2024-03-15"
    },
    recentQuizzes: [
        {
            id: "physics-quiz-1",
            title: "Physics Fundamentals Quiz",
            date: "2024-03-15",
            score: 85,
            timeTaken: 25, // minutes
            correctAnswers: 17,
            totalQuestions: 20
        },
        {
            id: "chemistry-quiz-1",
            title: "Chemistry Basics Quiz",
            date: "2024-03-14",
            score: 75,
            timeTaken: 18,
            correctAnswers: 15,
            totalQuestions: 20
        },
        {
            id: "math-quiz-1",
            title: "Algebra Basics Quiz",
            date: "2024-03-13",
            score: 90,
            timeTaken: 30,
            correctAnswers: 18,
            totalQuestions: 20
        }
    ],
    subjectPerformance: {
        physics: {
            averageScore: 82,
            quizzesTaken: 5,
            lastQuizDate: "2024-03-15"
        },
        chemistry: {
            averageScore: 75,
            quizzesTaken: 4,
            lastQuizDate: "2024-03-14"
        },
        mathematics: {
            averageScore: 88,
            quizzesTaken: 6,
            lastQuizDate: "2024-03-13"
        }
    },
    weeklyProgress: [
        { week: "Week 1", averageScore: 70, quizzesTaken: 3 },
        { week: "Week 2", averageScore: 75, quizzesTaken: 4 },
        { week: "Week 3", averageScore: 82, quizzesTaken: 5 },
        { week: "Week 4", averageScore: 85, quizzesTaken: 3 }
    ]
};

export default quizProgress; 