// Native Doorlist uses display capitals for its formal and bold title styles.
// Keep the source name intact so changing a font can restore the original case.
export function displayEventTitle(event) {
  const title=String(event?.title||'');
  return ['Serif','Bartle'].includes(event?.fontFamily)?title.toUpperCase():title;
}
