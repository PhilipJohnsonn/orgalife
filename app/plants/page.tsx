'use client'

import { useState } from 'react'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import { format as dateFnsFormat, parse, startOfWeek, getDay } from 'date-fns'
import enUS from 'date-fns/locale/en-US'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import './calendar-styles.css'
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { CalendarIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as DatePicker } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"

const locales = {
  'en-US': enUS,
}

const localizer = dateFnsLocalizer({
  format: dateFnsFormat,
  parse,
  startOfWeek,
  getDay,
  locales,
})

interface Event {
  title: string
  start: Date
  end: Date
}

export default function Plants() {
  const [events, setEvents] = useState<Event[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())

  const handleSelectSlot = ({ start, end }: { start: Date; end: Date }) => {
    const title = prompt('Enter event title:')
    if (title) {
      setEvents([...events, { title, start, end }])
    }
  }

  const sidebarOptions = [
    { name: 'All Plants', onClick: () => console.log('All Plants clicked') },
    { name: 'Indoor', onClick: () => console.log('Indoor clicked') },
    { name: 'Outdoor', onClick: () => console.log('Outdoor clicked') },
    { name: 'Watering Schedule', onClick: () => console.log('Watering Schedule clicked') },
    { name: 'Fertilizing Schedule', onClick: () => console.log('Fertilizing Schedule clicked') },
  ]

  return (
    <SidebarInset>
      <div className="flex h-full">
        <Sidebar className="w-64 border-r">
          <SidebarHeader>
            <h2 className="text-xl font-bold px-4 py-2">Plant Options</h2>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              {sidebarOptions.map((option) => (
                <SidebarMenuItem key={option.name}>
                  <SidebarMenuButton onClick={option.onClick}>
                    {option.name}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
        <div className="flex-1 p-4 overflow-auto">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">Plant Care Calendar</h1>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-[240px] justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? dateFnsFormat(selectedDate, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <DatePicker
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"            
            selectable
            onSelectSlot={handleSelectSlot}
            date={selectedDate}
            onNavigate={(date) => setSelectedDate(date)}
          />
        </div>
      </div>
    </SidebarInset>
  )
}

