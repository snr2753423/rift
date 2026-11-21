/** Campus buildings you can open as a twin. Names match OpenStreetMap; rooms label the schematic interior. */
export interface Featured {
  name: string
  short: string
  kind: string
  rooms: string[]
  note?: string
}

export const FEATURED: Featured[] = [
  { name: 'Memorial Student Center', short: 'MSC', kind: 'Student center', note: 'tidalBYTE is here', rooms: ['Flag Room', 'Dining', 'Bookstore', 'Ballroom', 'Meeting Room', 'Lounge', 'Kitchen', 'Gallery', 'Study Lounge', 'Info Desk'] },
  { name: 'Zachry Engineering Education Complex', short: 'Zachry', kind: 'Engineering', rooms: ['Atrium', 'Learning Studio', 'Fluids Lab', 'Huddle Room', 'Materials Lab', 'Design Center', 'Classroom', 'Welcome Center', 'Machine Shop'] },
  { name: 'Sterling C. Evans Library', short: 'Evans Library', kind: 'Library', rooms: ['Reading Room', 'Stacks', 'Group Study', 'Reference', 'Cafe', 'Computer Lab', 'Study Rooms', 'Media Room'] },
  { name: 'Academic Building', short: 'Academic Building', kind: 'Classrooms', rooms: ['Rotunda', 'Classroom', 'Lecture Hall', 'Office', 'Seminar Room'] },
  { name: 'Innovative Learning Classroom Building', short: 'ILCB', kind: 'Classrooms', rooms: ['Lecture Hall', 'Active Learning', 'Classroom', 'Study Area', 'Lobby'] },
  { name: 'Blocker Building', short: 'Blocker', kind: 'Classrooms', rooms: ['Lecture Hall', 'Classroom', 'Seminar Room', 'Office', 'Lounge'] },
  { name: 'Duncan Dining Hall', short: 'Duncan', kind: 'Dining hall', rooms: ['Dining Hall', 'Kitchen', 'Servery', 'Lounge', 'Storage'] },
  { name: 'Student Recreation Center', short: 'Rec Center', kind: 'Recreation', rooms: ['Weight Room', 'Gym', 'Natatorium', 'Studio', 'Climbing Wall', 'Locker Room', 'Lobby'] },
]

export const featuredByName = new Map(FEATURED.map(f => [f.name, f]))
