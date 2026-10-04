import React, { useMemo, useState } from 'react';
import RecapSection from './RecapSection.jsx';
import {
  collectMonths, monthList, monthOptions, monthReview, monthCaption, monthSub, monthShareLine, currentMonthKey,
} from './monthRecapLogic.js';

// Month in review: the same shareable card as Year in review, for one calendar
// month (the person's local months). Defaults to the most recent month with any
// watching; the current month is labelled "so far". Hidden when there is no history.
export default function MonthInReview({ shows, movies }) {
  const months = useMemo(() => collectMonths(shows, movies), [shows, movies]);
  const list = useMemo(() => monthList(months), [months]);
  const [picked, setPicked] = useState(null);
  const active = picked && list.includes(picked) ? picked : list[0];
  const data = useMemo(() => (active ? monthReview(months, active, currentMonthKey()) : null), [months, active]);
  if (!data) return null;
  return (
    <RecapSection
      title="Month in review"
      className="a-mir"
      select={{ id: 'mir-month', label: 'Month', value: active, onChange: setPicked, options: monthOptions(list) }}
      data={data}
      big={data.name}
      sub={monthSub(data)}
      imageCaption={monthCaption(data)}
      fileName={`watchnext-${data.ym}.png`}
      shareTitle="WatchNext — Month in Review"
      shareLine={monthShareLine(data)}
      errorLabel="Month in review"
    />
  );
}
