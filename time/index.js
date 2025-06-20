#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Unified schema for the single time tool
const TimeOperationArgumentsSchema = z.object({
  operation: z.enum([
    "get_current_time",
    "get_timestamp", 
    "format_time",
    "convert_timezone",
    "add_time",
    "compare_time",
    "get_timezone_info",
    "calculate_working_days",
    "get_date_info",
    "calculate_age",
    "get_period_boundaries",
    "is_leap_year",
    "parse_duration"
  ]),
  // Optional parameters used by different operations
  timezone: z.string().optional(),
  format: z.string().optional(),
  unit: z.enum(["seconds", "milliseconds"]).optional(),
  timestamp: z.number().optional(),
  datetime: z.string().optional(),
  fromTimezone: z.string().optional(),
  toTimezone: z.string().optional(),
  years: z.number().optional(),
  months: z.number().optional(),
  days: z.number().optional(),
  hours: z.number().optional(),
  minutes: z.number().optional(),
  seconds: z.number().optional(),
  datetime1: z.string().optional(),
  datetime2: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  excludeWeekends: z.boolean().optional(),
  date: z.string().optional(),
  birthDate: z.string().optional(),
  referenceDate: z.string().optional(),
  period: z.enum(["day", "week", "month", "year"]).optional(),
  year: z.number().optional(),
  duration: z.string().optional(),
});

// Create server instance
const server = new Server(
  {
    name: "time",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper functions
function formatDateTime(date, format = "ISO", timezone = null) {
  if (timezone) {
    const options = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    };
    
    switch (format?.toLowerCase()) {
      case 'iso':
        return date.toISOString();
      case 'locale':
        return date.toLocaleString('en-US', options);
      case 'date':
        return date.toLocaleDateString('en-US', { timeZone: timezone });
      case 'time':
        return date.toLocaleTimeString('en-US', { timeZone: timezone });
      default:
        return date.toLocaleString('en-US', options);
    }
  }
  
  switch (format?.toLowerCase()) {
    case 'iso':
      return date.toISOString();
    case 'locale':
      return date.toLocaleString('en-US');
    case 'date':
      return date.toLocaleDateString('en-US');
    case 'time':
      return date.toLocaleTimeString('en-US');
    case 'unix':
      return Math.floor(date.getTime() / 1000).toString();
    default:
      return date.toISOString();
  }
}

function calculateWorkingDays(startDate, endDate, excludeWeekends = true) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let count = 0;
  const current = new Date(start);
  
  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (excludeWeekends) {
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday or Saturday
        count++;
      }
    } else {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return count;
}

function getDateInfo(date) {
  const d = new Date(date);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  
  const dayOfWeek = d.getDay();
  const dayOfMonth = d.getDate();
  const month = d.getMonth();
  const year = d.getFullYear();
  
  // Calculate week of year
  const startOfYear = new Date(year, 0, 1);
  const weekOfYear = Math.ceil((((d - startOfYear) / 86400000) + startOfYear.getDay() + 1) / 7);
  
  // Calculate day of year
  const dayOfYear = Math.floor((d - startOfYear) / (24 * 60 * 60 * 1000)) + 1;
  
  return {
    dayName: dayNames[dayOfWeek],
    dayOfWeek: dayOfWeek + 1, // 1-7 instead of 0-6
    dayOfMonth,
    monthName: monthNames[month],
    month: month + 1, // 1-12 instead of 0-11
    year,
    weekOfYear,
    dayOfYear,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    isWeekday: dayOfWeek > 0 && dayOfWeek < 6
  };
}

function calculateAge(birthDate, referenceDate = new Date()) {
  const birth = new Date(birthDate);
  const reference = new Date(referenceDate);
  
  let years = reference.getFullYear() - birth.getFullYear();
  let months = reference.getMonth() - birth.getMonth();
  let days = reference.getDate() - birth.getDate();
  
  if (days < 0) {
    months--;
    const daysInPreviousMonth = new Date(reference.getFullYear(), reference.getMonth(), 0).getDate();
    days += daysInPreviousMonth;
  }
  
  if (months < 0) {
    years--;
    months += 12;
  }
  
  const totalDays = Math.floor((reference - birth) / (24 * 60 * 60 * 1000));
  
  return { years, months, days, totalDays };
}

function getPeriodBoundaries(date, period) {
  const d = new Date(date);
  let start, end;
  
  switch (period) {
    case 'day':
      start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      break;
    case 'week':
      const dayOfWeek = d.getDay();
      start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayOfWeek);
      end = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayOfWeek + 6, 23, 59, 59, 999);
      break;
    case 'month':
      start = new Date(d.getFullYear(), d.getMonth(), 1);
      end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
    case 'year':
      start = new Date(d.getFullYear(), 0, 1);
      end = new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
      break;
    default:
      throw new Error('Invalid period');
  }
  
  return { start, end };
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function parseDuration(durationStr) {
  const regex = /(\d+)\s*(year|years|y|month|months|mo|week|weeks|w|day|days|d|hour|hours|h|minute|minutes|min|m|second|seconds|sec|s)/gi;
  let totalMs = 0;
  let match;
  
  const conversions = {
    year: 365.25 * 24 * 60 * 60 * 1000,
    month: 30.44 * 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    hour: 60 * 60 * 1000,
    minute: 60 * 1000,
    second: 1000
  };
  
  while ((match = regex.exec(durationStr)) !== null) {
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    let unitKey = unit;
    if (unit.startsWith('y')) unitKey = 'year';
    else if (unit.startsWith('mo')) unitKey = 'month';
    else if (unit.startsWith('w')) unitKey = 'week';
    else if (unit.startsWith('d')) unitKey = 'day';
    else if (unit.startsWith('h')) unitKey = 'hour';
    else if (unit.startsWith('m')) unitKey = 'minute';
    else if (unit.startsWith('s')) unitKey = 'second';
    
    totalMs += value * conversions[unitKey];
  }
  
  return totalMs;
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "time_operation",
        description: "Unified time utility tool supporting all time operations",
        inputSchema: {
          type: "object",
          properties: {
            operation: {
              type: "string",
              enum: [
                "get_current_time",
                "get_timestamp", 
                "format_time",
                "convert_timezone",
                "add_time",
                "compare_time",
                "get_timezone_info",
                "calculate_working_days",
                "get_date_info",
                "calculate_age",
                "get_period_boundaries",
                "is_leap_year",
                "parse_duration"
              ],
              description: "Operation to perform"
            },
            timezone: {
              type: "string",
              description: "Timezone (e.g., 'Asia/Ho_Chi_Minh', 'UTC', 'America/New_York')",
            },
            format: {
              type: "string",
              description: "Format: 'ISO', 'locale', 'date', 'time', 'unix'",
            },
            unit: {
              type: "string",
              enum: ["seconds", "milliseconds"],
              description: "Timestamp unit for get_timestamp"
            },
            timestamp: {
              type: "number",
              description: "Timestamp to format (in milliseconds) for format_time"
            },
            datetime: {
              type: "string",
              description: "ISO datetime string"
            },
            fromTimezone: {
              type: "string",
              description: "Source timezone for convert_timezone"
            },
            toTimezone: {
              type: "string", 
              description: "Target timezone for convert_timezone"
            },
            years: {
              type: "number",
              description: "Years to add for add_time"
            },
            months: {
              type: "number",
              description: "Months to add for add_time"
            },
            days: {
              type: "number",
              description: "Days to add for add_time"
            },
            hours: {
              type: "number",
              description: "Hours to add for add_time"
            },
            minutes: {
              type: "number",
              description: "Minutes to add for add_time"
            },
            seconds: {
              type: "number",
              description: "Seconds to add for add_time"
            },
            datetime1: {
              type: "string",
              description: "First datetime for compare_time"
            },
            datetime2: {
              type: "string",
              description: "Second datetime for compare_time"
            },
            startDate: {
              type: "string",
              description: "Start date for calculate_working_days"
            },
            endDate: {
              type: "string",
              description: "End date for calculate_working_days"
            },
            excludeWeekends: {
              type: "boolean",
              description: "Exclude weekends for calculate_working_days"
            },
            date: {
              type: "string",
              description: "Date to analyze for get_date_info/get_period_boundaries"
            },
            birthDate: {
              type: "string",
              description: "Birth date for calculate_age"
            },
            referenceDate: {
              type: "string",
              description: "Reference date for calculate_age"
            },
            period: {
              type: "string",
              enum: ["day", "week", "month", "year"],
              description: "Period for get_period_boundaries"
            },
            year: {
              type: "number",
              description: "Year to check for is_leap_year"
            },
            duration: {
              type: "string",
              description: "Duration string to parse for parse_duration"
            }
          },
          required: ["operation"],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "time_operation") {
      const validatedArgs = TimeOperationArgumentsSchema.parse(args);
      const { operation } = validatedArgs;

      switch (operation) {
        case "get_current_time": {
          const { timezone, format } = validatedArgs;
          const now = new Date();
          const formattedTime = formatDateTime(now, format, timezone);
          
          return {
            content: [
              {
                type: "text",
                text: formattedTime,
              },
            ],
          };
        }

        case "get_timestamp": {
          const { unit = "milliseconds" } = validatedArgs;
          const now = Date.now();
          const timestamp = unit === "seconds" ? Math.floor(now / 1000) : now;
          
          return {
            content: [
              {
                type: "text",
                text: timestamp.toString(),
              },
            ],
          };
        }

        case "format_time": {
          const { timestamp, format, timezone } = validatedArgs;
          if (!timestamp) throw new Error("timestamp is required for format_time");
          
          const date = new Date(timestamp);
          const formattedTime = formatDateTime(date, format, timezone);
          
          return {
            content: [
              {
                type: "text",
                text: formattedTime,
              },
            ],
          };
        }

        case "convert_timezone": {
          const { datetime, fromTimezone, toTimezone } = validatedArgs;
          if (!datetime || !fromTimezone || !toTimezone) {
            throw new Error("datetime, fromTimezone, and toTimezone are required for convert_timezone");
          }
          
          const date = new Date(datetime);
          const converted = formatDateTime(date, "ISO", toTimezone);
          const readableTime = formatDateTime(date, "locale", toTimezone);
          
          return {
            content: [
              {
                type: "text",
                text: `Converted from ${fromTimezone} to ${toTimezone}:\nISO: ${converted}\nReadable: ${readableTime}`,
              },
            ],
          };
        }

        case "add_time": {
          const { datetime, years, months, days, hours, minutes, seconds } = validatedArgs;
          
          const baseDate = datetime ? new Date(datetime) : new Date();
          const resultDate = new Date(baseDate);
          
          if (years) resultDate.setFullYear(resultDate.getFullYear() + years);
          if (months) resultDate.setMonth(resultDate.getMonth() + months);
          if (days) resultDate.setDate(resultDate.getDate() + days);
          if (hours) resultDate.setHours(resultDate.getHours() + hours);
          if (minutes) resultDate.setMinutes(resultDate.getMinutes() + minutes);
          if (seconds) resultDate.setSeconds(resultDate.getSeconds() + seconds);
          
          const additions = [];
          if (years) additions.push(`${years} years`);
          if (months) additions.push(`${months} months`);
          if (days) additions.push(`${days} days`);
          if (hours) additions.push(`${hours} hours`);
          if (minutes) additions.push(`${minutes} minutes`);
          if (seconds) additions.push(`${seconds} seconds`);
          
          return {
            content: [
              {
                type: "text",
                text: `Original time: ${baseDate.toISOString()}\nAdded: ${additions.join(', ')}\nResult: ${resultDate.toISOString()}\nReadable: ${resultDate.toLocaleString('en-US')}`,
              },
            ],
          };
        }

        case "compare_time": {
          const { datetime1, datetime2 } = validatedArgs;
          if (!datetime1 || !datetime2) {
            throw new Error("datetime1 and datetime2 are required for compare_time");
          }
          
          const date1 = new Date(datetime1);
          const date2 = new Date(datetime2);
          const diffMs = date2.getTime() - date1.getTime();
          const diffSeconds = Math.abs(diffMs) / 1000;
          const diffMinutes = diffSeconds / 60;
          const diffHours = diffMinutes / 60;
          const diffDays = diffHours / 24;
          
          let comparison;
          if (diffMs > 0) {
            comparison = "Datetime2 is later than datetime1";
          } else if (diffMs < 0) {
            comparison = "Datetime1 is later than datetime2";
          } else {
            comparison = "Both datetimes are identical";
          }
          
          return {
            content: [
              {
                type: "text",
                text: `${comparison}\nDifference: ${Math.floor(diffDays)} days, ${Math.floor(diffHours % 24)} hours, ${Math.floor(diffMinutes % 60)} minutes, ${Math.floor(diffSeconds % 60)} seconds`,
              },
            ],
          };
        }

        case "get_timezone_info": {
          const now = new Date();
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const offset = now.getTimezoneOffset();
          const offsetHours = Math.floor(Math.abs(offset) / 60);
          const offsetMinutes = Math.abs(offset) % 60;
          const offsetSign = offset <= 0 ? '+' : '-';
          
          return {
            content: [
              {
                type: "text",
                text: `Current timezone: ${timezone}\nUTC Offset: ${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}\nLocal time: ${now.toLocaleString('en-US')}\nUTC time: ${now.toISOString()}`,
              },
            ],
          };
        }

        case "calculate_working_days": {
          const { startDate, endDate, excludeWeekends = true } = validatedArgs;
          if (!startDate || !endDate) {
            throw new Error("startDate and endDate are required for calculate_working_days");
          }
          
          const workingDays = calculateWorkingDays(startDate, endDate, excludeWeekends);
          const totalDays = Math.ceil((new Date(endDate) - new Date(startDate)) / (24 * 60 * 60 * 1000)) + 1;
          
          return {
            content: [
              {
                type: "text",
                text: `Period: ${startDate} to ${endDate}\nTotal days: ${totalDays}\nWorking days: ${workingDays}${excludeWeekends ? ' (excluding weekends)' : ' (including weekends)'}`,
              },
            ],
          };
        }

        case "get_date_info": {
          const { date } = validatedArgs;
          const targetDate = date || new Date().toISOString().split('T')[0];
          const info = getDateInfo(targetDate);
          
          return {
            content: [
              {
                type: "text",
                text: `Date: ${targetDate}\nDay: ${info.dayName} (${info.dayOfWeek}/7)\nMonth: ${info.monthName} (${info.month}/12)\nYear: ${info.year}\nWeek of year: ${info.weekOfYear}\nDay of year: ${info.dayOfYear}\nType: ${info.isWeekend ? 'Weekend' : 'Weekday'}`,
              },
            ],
          };
        }

        case "calculate_age": {
          const { birthDate, referenceDate } = validatedArgs;
          if (!birthDate) {
            throw new Error("birthDate is required for calculate_age");
          }
          
          const refDate = referenceDate ? new Date(referenceDate) : new Date();
          const age = calculateAge(birthDate, refDate);
          
          return {
            content: [
              {
                type: "text",
                text: `Birth date: ${birthDate}\nReference date: ${refDate.toISOString().split('T')[0]}\nAge: ${age.years} years, ${age.months} months, ${age.days} days\nTotal days lived: ${age.totalDays}`,
              },
            ],
          };
        }

        case "get_period_boundaries": {
          const { date, period } = validatedArgs;
          if (!period) {
            throw new Error("period is required for get_period_boundaries");
          }
          
          const targetDate = date || new Date().toISOString();
          const boundaries = getPeriodBoundaries(targetDate, period);
          
          return {
            content: [
              {
                type: "text",
                text: `Period: ${period}\nReference date: ${new Date(targetDate).toISOString().split('T')[0]}\nStart: ${boundaries.start.toISOString()}\nEnd: ${boundaries.end.toISOString()}`,
              },
            ],
          };
        }

        case "is_leap_year": {
          const { year } = validatedArgs;
          if (!year) {
            throw new Error("year is required for is_leap_year");
          }
          
          const leap = isLeapYear(year);
          const daysInYear = leap ? 366 : 365;
          const daysInFeb = leap ? 29 : 28;
          
          return {
            content: [
              {
                type: "text",
                text: `Year ${year}: ${leap ? 'Leap year' : 'Not a leap year'}\nDays in year: ${daysInYear}\nDays in February: ${daysInFeb}`,
              },
            ],
          };
        }

        case "parse_duration": {
          const { duration } = validatedArgs;
          if (!duration) {
            throw new Error("duration is required for parse_duration");
          }
          
          const totalMs = parseDuration(duration);
          const seconds = Math.floor(totalMs / 1000);
          const minutes = Math.floor(seconds / 60);
          const hours = Math.floor(minutes / 60);
          const days = Math.floor(hours / 24);
          
          return {
            content: [
              {
                type: "text",
                text: `Duration: "${duration}"\nTotal milliseconds: ${totalMs}\nEquivalent to:\n- ${seconds} seconds\n- ${minutes} minutes\n- ${hours} hours\n- ${days} days`,
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid arguments: ${error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ")}`
      );
    }
    throw error;
  }
});

async function runServer() {
  try {
    // Set up MCP server
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Time MCP Server v2.0 running on stdio");
  } catch (error) {
    const err = error;
    console.error("[Time Fatal] Server initialization failed");
    console.error(`[Time Fatal] Error: ${err.name}: ${err.message}`);
    console.error(`[Time Fatal] Stack: ${err.stack}`);
    process.exit(1);
  }
}

// Handle process termination
process.on("SIGINT", async () => {
  process.exit(0);
});

process.on("SIGTERM", async () => {
  process.exit(0);
});

runServer();
