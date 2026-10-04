import React from 'react';
import RecapSection from './RecapSection.jsx';

// Year in review: the shared RecapSection with the year's words. (The card and the
// saved image are drawn by RecapSection / yearImageRender.js.)
export default function YearInReview({ data, years, onYear }) {
  if (!data) return null;
  const shareLine = [
    `My ${data.year} in review on WatchNext:`,
    `${data.episodes.toLocaleString()} episodes (${data.hours.toLocaleString()} hrs) + ${data.movies} movie${data.movies === 1 ? '' : 's'}.`,
    data.topShows[0] ? `Top show: ${data.topShows[0].name}.` : '',
    data.busiestMonth ? `Busiest month: ${data.busiestMonth.name}.` : '',
  ].filter(Boolean).join(' ');
  return (
    <RecapSection
      title="Year in review"
      className="a-yir"
      select={{ id: 'yir-year', label: 'Year', value: String(data.year), onChange: onYear, options: years.map((y) => ({ value: y, label: y })) }}
      data={data}
      big={String(data.year)}
      imageCaption="YEAR IN REVIEW"
      fileName={`watchnext-${data.year}.png`}
      shareTitle="WatchNext — Year in Review"
      shareLine={shareLine}
      errorLabel="Year in review"
    />
  );
}
