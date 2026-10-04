import { useColorScheme } from 'react-native';

// Light and dark palettes. Text colours meet WCAG AA (4.5:1) on both `bg` and `card`.
const light = {
  dark: false,
  bg: '#F8F6F1',
  card: '#FFFFFF',
  cardAlt: '#F1EEE7',
  text: '#1B2420',
  muted: '#58625E',
  border: '#E6E1D8',
  track: '#E9E5DD',
  primary: '#24706A',
  onPrimary: '#FFFFFF',
  primarySoft: '#DDF0EC',
  success: '#1B7A50',
  successSoft: '#E1F3EA',
  warning: '#8F5400',
  warningSoft: '#FCEFD9',
  danger: '#B42318',
  dangerSoft: '#FDE7E4',
};

const dark: typeof light = {
  dark: true,
  bg: '#0F1312',
  card: '#181E1C',
  cardAlt: '#222A27',
  text: '#F2F3F5',
  muted: '#A6ACB7',
  border: '#2B3038',
  track: '#2B3038',
  primary: '#6CC9BD',
  onPrimary: '#06201D',
  primarySoft: '#14332F',
  success: '#5FD39B',
  successSoft: '#123326',
  warning: '#F4BB55',
  warningSoft: '#3A2A0E',
  danger: '#FF7A6B',
  dangerSoft: '#3D1714',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Category colours: mid-tones that read on both light and dark cards. */
export const accents = {
  wellbeing: '#24706A',
  meds: '#30A46C',
  fluids: '#05A2C2',
  meals: '#F76B15',
  bloodPressure: '#E5484D',
  heartRate: '#D6409F',
  spo2: '#0090FF',
  glucose: '#8E4EC6',
  temperature: '#F76B15',
  weight: '#AD7F58',
  respiration: '#12A594',
  pain: '#6E56CF',
  sleep: '#5B5BD6',
  neutral: '#8B8D98',
};

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 };
