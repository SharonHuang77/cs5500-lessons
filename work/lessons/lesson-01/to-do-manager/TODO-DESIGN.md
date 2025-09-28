# Terminal Todo Manager - Design Document

## Project Overview

A terminal-based todo manager built with TypeScript and the `blessed` library, featuring a multi-panel interface and clean MVC (Model-View-Controller) architecture.

### Key Features
- **Multi-panel UI**: Different sections for different functions
- **Real-time updates**: Changes reflected immediately across panels
- **Keyboard navigation**: Fully keyboard-driven interface
- **Persistent storage**: Todos saved to JSON file
- **Category management**: Organize todos by categories/projects
- **Priority levels**: High, Medium, Low priority todos

## System Architecture (MVC Pattern)

### What is MVC?
MVC separates your application into three main parts:
- **Model**: Manages data and business logic (your todos, categories)
- **View**: Handles the user interface (what you see on screen)
- **Controller**: Connects Model and View, handles user input

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│    View     │◄──►│  Controller  │◄──►│    Model    │
│  (blessed)  │    │   (Events)   │    │   (Data)    │
└─────────────┘    └──────────────┘    └─────────────┘
```

### Directory Structure
```
todo-manager/
├── src/
│   ├── models/
│   │   ├── Todo.ts           # Todo data structure
│   │   ├── Category.ts       # Category data structure
│   │   └── TodoManager.ts    # Main data management
│   ├── views/
│   │   ├── BaseView.ts       # Common view functionality
│   │   ├── TodoListView.ts   # Main todo list panel
│   │   ├── CategoryView.ts   # Categories sidebar
│   │   ├── DetailView.ts     # Todo details panel
│   │   └── StatusView.ts     # Status/help bar
│   ├── controllers/
│   │   ├── AppController.ts  # Main application controller
│   │   └── InputController.ts # Keyboard input handling
│   ├── utils/
│   │   ├── FileManager.ts    # Save/load data
│   │   └── KeyBindings.ts    # Keyboard shortcuts
│   └── app.ts               # Main entry point
├── data/
│   └── todos.json           # Data storage
├── package.json
├── tsconfig.json
└── README.md
```

## Data Models

### Todo Interface
```typescript
interface Todo {
  id: string;              // Unique identifier
  title: string;           // Todo title
  description?: string;    // Optional detailed description
  completed: boolean;      // Completion status
  priority: Priority;      // High, Medium, Low
  categoryId: string;      // Which category it belongs to
  createdAt: Date;        // When it was created
  completedAt?: Date;     // When it was completed
  dueDate?: Date;         // Optional due date
}

enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}
```

### Category Interface
```typescript
interface Category {
  id: string;              // Unique identifier
  name: string;            // Category name
  color: string;           // Color code for display
  todoCount: number;       // Number of todos in category
}
```

## UI Layout Design

### Overall Layout (80x24 terminal)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Terminal Todo Manager                             │
├──────────────────┬──────────────────────────┬───────────────────────────────┤
│   Categories     │      Todo List           │        Details               │
│   (Width: 20)    │    (Width: 35)           │      (Width: 25)             │
│                  │                          │                              │
│ □ All Tasks (12) │ □ Buy groceries         │ Title: Buy groceries          │
│ □ Work (5)       │ □ Finish report         │ Category: Personal            │
│ □ Personal (7)   │ ☑ Call mom             │ Priority: High                │
│ □ Shopping (3)   │ □ Fix bike             │ Due: Tomorrow                 │
│                  │ □ Plan vacation        │                              │
│ [+ New Category] │                        │ Description:                  │
│                  │                        │ Get milk, bread, eggs         │
│                  │                        │ and vegetables for the        │
│                  │                        │ week.                         │
│                  │                        │                              │
│                  │                        │ Created: 2 days ago           │
│                  │                        │                              │
│                  │ [+ New Todo]           │ [Edit] [Complete] [Delete]    │
├──────────────────┴──────────────────────────┴───────────────────────────────┤
│ Status: 12 todos, 3 completed | F1: Help | Tab: Next Panel | Esc: Quit     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Panel Descriptions

#### 1. Categories Panel (Left)
- **Purpose**: Filter todos by category
- **Features**:
  - List all categories with todo counts
  - "All Tasks" shows everything
  - Highlight active category
  - Add new categories
- **Navigation**: Up/Down arrows, Enter to select

#### 2. Todo List Panel (Center)
- **Purpose**: Display and manage todos
- **Features**:
  - Show todos from selected category
  - Checkboxes for completion status
  - Priority indicators (colors/symbols)
  - Sorting options
  - Add new todos
- **Navigation**: Up/Down arrows, Space to toggle complete

#### 3. Details Panel (Right)
- **Purpose**: Show detailed todo information
- **Features**:
  - Full todo details
  - Edit capabilities
  - Action buttons
  - Due date information
- **Navigation**: Tab to action buttons

#### 4. Status Bar (Bottom)
- **Purpose**: Show app status and shortcuts
- **Features**:
  - Current statistics
  - Keyboard shortcuts
  - Current mode/state

## Technical Requirements

### Dependencies
```json
{
  "dependencies": {
    "blessed": "^0.1.81",
    "@types/blessed": "^0.1.21"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^18.0.0",
    "ts-node": "^10.0.0",
    "nodemon": "^2.0.0"
  }
}
```

### Core Classes

#### TodoManager (Model)
```typescript
class TodoManager {
  private todos: Todo[] = [];
  private categories: Category[] = [];
  
  // CRUD operations
  addTodo(todo: Omit<Todo, 'id' | 'createdAt'>): Todo
  updateTodo(id: string, updates: Partial<Todo>): boolean
  deleteTodo(id: string): boolean
  getTodosByCategory(categoryId: string): Todo[]
  
  // Category management
  addCategory(name: string, color: string): Category
  deleteCategory(id: string): boolean
  
  // Data persistence
  save(): Promise<void>
  load(): Promise<void>
}
```

#### AppController (Controller)
```typescript
class AppController {
  private todoManager: TodoManager;
  private currentPanel: PanelType = 'categories';
  private selectedCategory: string = 'all';
  
  // Initialize the application
  async initialize(): Promise<void>
  
  // Handle user input
  handleKeyPress(key: string): void
  
  // Update views when data changes
  refreshViews(): void
  
  // Panel switching
  switchPanel(panel: PanelType): void
}
```

#### BaseView (View)
```typescript
abstract class BaseView {
  protected box: blessed.Widgets.BoxElement;
  protected screen: blessed.Widgets.Screen;
  
  constructor(screen: blessed.Widgets.Screen, options: blessed.Widgets.BoxOptions)
  
  // Abstract methods that child classes must implement
  abstract render(): void
  abstract handleInput(key: string): void
  
  // Common functionality
  focus(): void
  blur(): void
  show(): void
  hide(): void
}
```

## Key Features Implementation

### 1. Keyboard Navigation
```typescript
// Key bindings
const keyBindings = {
  'tab': 'next-panel',
  'S-tab': 'prev-panel',
  'up': 'move-up',
  'down': 'move-down',
  'enter': 'select',
  'space': 'toggle-complete',
  'n': 'new-todo',
  'e': 'edit-todo',
  'd': 'delete-todo',
  'f1': 'show-help',
  'escape': 'quit'
};
```

### 2. Data Persistence
```typescript
// FileManager utility
class FileManager {
  private dataPath = './data/todos.json';
  
  async save(data: { todos: Todo[], categories: Category[] }): Promise<void> {
    // Save to JSON file
  }
  
  async load(): Promise<{ todos: Todo[], categories: Category[] }> {
    // Load from JSON file
  }
}
```

### 3. Real-time Updates
- When data changes in the model, controller notifies all views
- Views re-render their content
- Active selections are preserved during updates



