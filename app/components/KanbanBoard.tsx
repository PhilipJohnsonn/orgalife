'use client'

import React, { useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { PlusCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface Task {
  id: string
  content: string
}

interface Column {
  id: string
  title: string
  tasks: Task[]
}

const initialColumns: Column[] = [
  {
    id: 'todo',
    title: 'To Do',
    tasks: [{ id: 'task-1', content: 'Take out the garbage' }],
  },
  {
    id: 'in-progress',
    title: 'In Progress',
    tasks: [{ id: 'task-2', content: 'Watch my favorite show' }],
  },
  {
    id: 'done',
    title: 'Done',
    tasks: [{ id: 'task-3', content: 'Charge my phone' }],
  },
]

export default function KanbanBoard() {
  const [columns, setColumns] = useState(initialColumns)
  const [newTask, setNewTask] = useState('')
  const [activeColumn, setActiveColumn] = useState('')

  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result

    // If dropped outside the list
    if (!destination) return

    // If dropped in the same position
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return
    }

    // Find source and destination columns
    const sourceColumn = columns.find(col => col.id === source.droppableId)
    const destColumn = columns.find(col => col.id === destination.droppableId)

    if (!sourceColumn || !destColumn) return

    // Create new array of tasks for source column
    const sourceTasks = Array.from(sourceColumn.tasks)
    // Remove the task from the source column
    const [removedTask] = sourceTasks.splice(source.index, 1)

    if (source.droppableId === destination.droppableId) {
      // If moving within the same column
      sourceTasks.splice(destination.index, 0, removedTask)
      const newColumns = columns.map(col =>
        col.id === sourceColumn.id ? { ...col, tasks: sourceTasks } : col
      )
      setColumns(newColumns)
    } else {
      // If moving to a different column
      const destTasks = Array.from(destColumn.tasks)
      destTasks.splice(destination.index, 0, removedTask)
      const newColumns = columns.map(col => {
        if (col.id === sourceColumn.id) {
          return { ...col, tasks: sourceTasks }
        }
        if (col.id === destColumn.id) {
          return { ...col, tasks: destTasks }
        }
        return col
      })
      setColumns(newColumns)
    }
  }

  const addNewTask = () => {
    if (newTask.trim() === '' || activeColumn === '') return

    const newTaskObj: Task = {
      id: `task-${Date.now()}`,
      content: newTask,
    }

    const newColumns = columns.map(col =>
      col.id === activeColumn
        ? { ...col, tasks: [...col.tasks, newTaskObj] }
        : col
    )

    setColumns(newColumns)
    setNewTask('')
    setActiveColumn('')
  }

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Kanban Board</h2>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex space-x-4">
          {columns.map(column => (
            <div key={column.id} className="bg-gray-100 p-4 rounded-lg w-64">
              <h3 className="font-semibold mb-2">{column.title}</h3>
              <Droppable droppableId={column.id}>
                {(provided) => (
                  <ul
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="min-h-[200px]"
                  >
                    {column.tasks.map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided) => (
                          <li
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className="bg-white p-2 mb-2 rounded shadow"
                          >
                            {task.content}
                          </li>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </ul>
                )}
              </Droppable>
              <Dialog>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-full mt-2"
                    onClick={() => setActiveColumn(column.id)}
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Task
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add a new task</DialogTitle>
                  </DialogHeader>
                  <div className="flex items-center space-x-2">
                    <Input
                      value={newTask}
                      onChange={(e) => setNewTask(e.target.value)}
                      placeholder="Enter task description"
                    />
                    <Button onClick={addNewTask}>Add</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  )
}

