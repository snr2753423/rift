/** Campus buildings you can open as a twin. Names match OpenStreetMap; rooms label the schematic interior. */
export interface Featured {
  name: string
  short: string
  kind: string
  rooms: string[]
  note?: string
  /** sidebar section */
  group: 'Campus life' | 'Academics' | 'Residence halls'
  /** floor count to use when neither Texas A&M Facilities GIS nor OpenStreetMap gives one */
  floors?: number
  /** keep OpenStreetMap's outline: the university outline pinches below one simulation cell and splits a wing off */
  osmOutline?: boolean
  /** drawn as a small pin, named on hover, so clustered buildings don't bury each other's labels */
  minor?: boolean
}

export const FEATURED: Featured[] = [
  { name: 'Memorial Student Center', short: 'MSC', kind: 'Student center', group: 'Campus life', note: 'tidalBYTE is here', rooms: ['Flag Room', 'Dining', 'Bookstore', 'Ballroom', 'Meeting Room', 'Lounge', 'Kitchen', 'Gallery', 'Study Lounge', 'Info Desk'] },
  { name: 'Zachry Engineering Education Complex', short: 'Zachry', kind: 'Engineering', group: 'Academics', rooms: ['Atrium', 'Learning Studio', 'Fluids Lab', 'Huddle Room', 'Materials Lab', 'Design Center', 'Classroom', 'Welcome Center', 'Machine Shop'] },
  { name: 'Sterling C. Evans Library', short: 'Evans Library', kind: 'Library', group: 'Academics', rooms: ['Reading Room', 'Stacks', 'Group Study', 'Reference', 'Cafe', 'Computer Lab', 'Study Rooms', 'Media Room'] },
  { name: 'Academic Building', short: 'Academic Building', kind: 'Classrooms', group: 'Academics', rooms: ['Rotunda', 'Classroom', 'Lecture Hall', 'Office', 'Seminar Room'] },
  { name: 'Innovative Learning Classroom Building', short: 'ILCB', kind: 'Classrooms', group: 'Academics', rooms: ['Lecture Hall', 'Active Learning', 'Classroom', 'Study Area', 'Lobby'] },
  { name: 'Blocker Building', short: 'Blocker', kind: 'Classrooms', group: 'Academics', rooms: ['Lecture Hall', 'Classroom', 'Seminar Room', 'Office', 'Lounge'] },
  { name: 'Duncan Dining Hall', short: 'Duncan', kind: 'Dining hall', group: 'Campus life', rooms: ['Dining Hall', 'Kitchen', 'Servery', 'Lounge', 'Storage'] },
  { name: 'Student Recreation Center', short: 'Rec Center', kind: 'Recreation', group: 'Campus life', rooms: ['Weight Room', 'Gym', 'Natatorium', 'Studio', 'Climbing Wall', 'Locker Room', 'Lobby'] },
  { name: 'Commons', short: 'The Commons', kind: 'Dining and study', group: 'Campus life', rooms: ['Dining', 'Market', 'Info Desk', 'Study Room', 'Kitchen', 'Lounge', 'Game Room', 'Meeting Room'] },
  { name: 'Sbisa Dining Hall', short: 'Sbisa', kind: 'Dining hall', group: 'Campus life', rooms: ['Dining Hall', 'Kitchen', 'Servery', 'Bakery', 'Lounge', 'Storage'] },
  { name: 'Koldus Building', short: 'Koldus', kind: 'Student services', group: 'Campus life', rooms: ['Lobby', 'Student Services', 'Meeting Room', 'Office', 'Conference Room'] },
  { name: 'Interdisciplinary Life Sciences Building', short: 'ILSB', kind: 'Labs', group: 'Academics', rooms: ['Atrium', 'Lab', 'Lecture Hall', 'Prep Room', 'Classroom', 'Study Area', 'Office'] },
  { name: 'Wehner Building', short: 'Wehner', kind: 'Mays Business', group: 'Academics', osmOutline: true, rooms: ['Classroom', 'Lecture Hall', 'Study Room', 'Career Center', 'Lounge', 'Office', 'Cafe'] },
  { name: 'Rudder Tower', short: 'Rudder Tower', kind: 'Offices', group: 'Academics', rooms: ['Lobby', 'Office', 'Meeting Room', 'Conference Room'] },
  { name: "Aston Residence Hall", short: "Aston", kind: 'Commons hall', group: 'Residence halls', minor: true, rooms: ["Suite A","Suite B","Study Lounge","Suite C","Suite D","Laundry","Suite E","Suite F","Community Kitchen","Suite G"] },
  { name: "Dunn Residence Hall", short: "Dunn", kind: 'Commons hall', group: 'Residence halls', minor: true, rooms: ["Suite A","Suite B","Study Lounge","Suite C","Suite D","Laundry","Suite E","Suite F","Community Kitchen","Suite G"] },
  { name: "Krueger Residence Hall", short: "Krueger", kind: 'Commons hall', group: 'Residence halls', minor: true, rooms: ["Suite A","Suite B","Study Lounge","Suite C","Suite D","Laundry","Suite E","Suite F","Community Kitchen","Suite G"] },
  { name: "Mosher Residence Hall", short: "Mosher", kind: 'Commons hall', group: 'Residence halls', minor: true, rooms: ["Suite A","Suite B","Study Lounge","Suite C","Suite D","Laundry","Suite E","Suite F","Community Kitchen","Suite G"] },
  { name: 'Hullabaloo Residence Hall', short: 'Hullabaloo', kind: 'Residence hall', group: 'Residence halls', rooms: ["Suite A","Suite B","Study Lounge","Suite C","Suite D","Laundry","Suite E","Suite F","Community Kitchen","Suite G"] },
]

export const featuredByName = new Map(FEATURED.map(f => [f.name, f]))
