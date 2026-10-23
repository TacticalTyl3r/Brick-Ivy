create or replace function public.brickivy_inquiry_analytics()
returns jsonb language sql stable security invoker set search_path=public
as $$
select jsonb_build_object(
 'total',count(*)::integer,
 'new',count(*) filter(where status='new')::integer,
 'inProgress',count(*) filter(where status='in_progress')::integer,
 'contacted',count(*) filter(where status='contacted')::integer,
 'awaitingCustomer',count(*) filter(where status='awaiting_customer')::integer,
 'closed',count(*) filter(where status='closed')::integer,
 'unassignedOpen',count(*) filter(where status<>'closed' and assigned_discord_id is null)::integer,
 'lastSevenDays',count(*) filter(where created_at>=now()-interval '7 days')::integer,
 'averageCloseHours',round((avg(extract(epoch from(closed_at-created_at))/3600)
   filter(where status='closed' and closed_at>=created_at))::numeric,1),
 'topProperties',(select coalesce(jsonb_agg(jsonb_build_object('propertyId',p.property_id,'propertyName',p.property_name,'count',p.cnt)
    order by p.cnt desc,p.property_name),'[]'::jsonb)
  from (select property_id,max(property_name) property_name,count(*)::integer cnt
   from public.brickivy_property_inquiries group by property_id order by cnt desc limit 10) p),
 'team',(select coalesce(jsonb_agg(jsonb_build_object('discordId',p.discord_id,'name',p.name,
     'assigned',p.assigned,'open',p.open_count,'closed',p.closed_count,'claims',coalesce(h.claims,0))
   order by p.assigned desc,p.name),'[]'::jsonb)
   from (select r.discord_user_id discord_id,max(r.name) name,count(i.id)::integer assigned,
    count(i.id) filter(where i.status<>'closed')::integer open_count,
    count(i.id) filter(where i.status='closed')::integer closed_count
    from public.brickivy_realtors r left join public.brickivy_property_inquiries i
      on i.assigned_discord_id=r.discord_user_id
    where r.discord_user_id is not null and r.discord_user_id<>''
    group by r.discord_user_id) p
   left join (select actor_discord_id,count(*)::integer claims
     from public.brickivy_inquiry_activity where event_type='claimed'
     group by actor_discord_id) h on h.actor_discord_id=p.discord_id)
) from public.brickivy_property_inquiries;
$$;
revoke all on function public.brickivy_inquiry_analytics() from public,anon,authenticated;
grant execute on function public.brickivy_inquiry_analytics() to service_role;
